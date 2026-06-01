import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  addPageNumbers,
  cropPdf,
  deletePages,
  downloadBlob,
  exportOrganizedPdf,
  type ExportPrecision,
  imagesToPdf,
  loadOrganizedPages,
  mergePdfs,
  nUpPdf,
  type OrganizedPage,
  pdfToImages,
  rasterEffectPdf,
  reorderPages,
  resizePdf,
  rotatePdf,
  savePdf,
  splitPdf,
} from './pdfTools';

type ToolId =
  | 'organize'
  | 'merge'
  | 'split'
  | 'resize'
  | 'crop'
  | 'rotate'
  | 'compress'
  | 'reorder'
  | 'delete'
  | 'numbers'
  | 'nup'
  | 'pdf-images'
  | 'images-pdf'
  | 'grayscale'
  | 'invert'
  | 'limited';

const tools: Array<{ id: ToolId; title: string; desc: string }> = [
  { id: 'organize', title: '页面编排', desc: '多 PDF 页面拖拽排序、删除并导出。' },
  { id: 'merge', title: '合并 PDF', desc: '按文件选择顺序合并多个 PDF。' },
  { id: 'split', title: '拆分/提取', desc: '按页或页段导出为 ZIP。' },
  { id: 'resize', title: '调整页面', desc: '改纸张尺寸或缩放页面内容。' },
  { id: 'crop', title: '裁剪边距', desc: '用点数裁掉上下左右边距。' },
  { id: 'rotate', title: '旋转页面', desc: '全部或指定页旋转 90/180/270 度。' },
  { id: 'compress', title: '压缩 PDF', desc: '对象流压缩或栅格化压缩。' },
  { id: 'reorder', title: '重排页面', desc: '输入新页序重新生成文档。' },
  { id: 'delete', title: '删除页面', desc: '删除指定页或页段。' },
  { id: 'numbers', title: '页码', desc: '添加页码、前缀和位置。' },
  { id: 'nup', title: 'N-Up', desc: '每张纸放 2 到 16 页。' },
  { id: 'pdf-images', title: 'PDF 转图片', desc: '每页导出 PNG/JPG 到 ZIP。' },
  { id: 'images-pdf', title: '图片转 PDF', desc: 'JPG/PNG 合成 PDF。' },
  { id: 'grayscale', title: '灰度 PDF', desc: '栅格化为黑白灰 PDF。' },
  { id: 'invert', title: '反色 PDF', desc: '栅格化并反转页面颜色。' },
  { id: 'limited', title: '高级/转换器', desc: '密码、表单、修复和 Office 转换说明。' },
];

const defaultRanges = 'all';

function App() {
  const [active, setActive] = useState<ToolId>('organize');
  const [files, setFiles] = useState<File[]>([]);
  const [organizedPages, setOrganizedPages] = useState<OrganizedPage[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [exportPrecision, setExportPrecision] = useState<ExportPrecision>('lossless');
  const [exportFileName, setExportFileName] = useState('eva-organized.pdf');
  const [organizerLoading, setOrganizerLoading] = useState(false);
  const [loadedPreviewPages, setLoadedPreviewPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('所有处理都在本机浏览器中执行，文件不会上传。');
  const [pages, setPages] = useState(defaultRanges);
  const [splitRanges, setSplitRanges] = useState('');
  const [angle, setAngle] = useState(90);
  const [paper, setPaper] = useState('A4');
  const [scale, setScale] = useState(100);
  const [margins, setMargins] = useState({ top: 24, right: 24, bottom: 24, left: 24 });
  const [nup, setNup] = useState(4);
  const [position, setPosition] = useState('bottomCenter');
  const [prefix, setPrefix] = useState('');
  const [fontSize, setFontSize] = useState(10);
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png');
  const [rasterScale, setRasterScale] = useState(1.5);
  const [quality, setQuality] = useState(0.72);

  const primaryFile = files[0];
  const acceptsImages = active === 'images-pdf';
  const currentTool = useMemo(() => tools.find((tool) => tool.id === active)!, [active]);

  const selectFiles = async (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    if (!selectedFiles.length) {
      setOrganizedPages([]);
      setSelectedPageIds([]);
      setLoadedPreviewPages(0);
      setMessage('请选择一个或多个 PDF。');
      return;
    }
    if (active !== 'organize') return;
    setBusy(true);
    setOrganizerLoading(true);
    setLoadedPreviewPages(0);
    setOrganizedPages([]);
    setSelectedPageIds([]);
    setMessage('正在读取 PDF 页面并生成缩略图...');
    try {
      const pages = await loadOrganizedPages(selectedFiles, (loadedPages) => {
        setLoadedPreviewPages(loadedPages);
        setMessage(`正在生成页面预览：已完成 ${loadedPages} 页...`);
      });
      setOrganizedPages(pages);
      setSelectedPageIds([]);
      setMessage(pages.length ? `已导入 ${selectedFiles.length} 个 PDF，共 ${pages.length} 页。可拖动页面排序或删除后导出。` : '没有读取到页面，请确认文件是有效 PDF。');
    } catch (error) {
      setOrganizedPages([]);
      setMessage(error instanceof Error ? error.message : 'PDF 页面读取失败。');
    } finally {
      setBusy(false);
      setOrganizerLoading(false);
    }
  };

  const moveOrganizedPage = (targetId: string) => {
    if (!draggedPageId || draggedPageId === targetId) return;
    setOrganizedPages((currentPages) => {
      const sourceIndex = currentPages.findIndex((page) => page.id === draggedPageId);
      const targetIndex = currentPages.findIndex((page) => page.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return currentPages;
      const nextPages = [...currentPages];
      const [moved] = nextPages.splice(sourceIndex, 1);
      nextPages.splice(targetIndex, 0, moved);
      return nextPages;
    });
  };

  const updateSelectedPages = (updater: (page: OrganizedPage) => OrganizedPage) => {
    const selected = new Set(selectedPageIds);
    setOrganizedPages((currentPages) => currentPages.map((page) => (selected.has(page.id) ? updater(page) : page)));
  };

  const deleteSelectedPages = () => {
    const selected = new Set(selectedPageIds);
    setOrganizedPages((currentPages) => currentPages.filter((page) => !selected.has(page.id)));
    setSelectedPageIds([]);
  };

  const run = async () => {
    if (active === 'organize' && !organizedPages.length) {
      setMessage('请先导入 PDF 并至少保留 1 页。');
      return;
    }
    if (!files.length && active !== 'limited' && active !== 'organize') {
      setMessage('请先选择文件。');
      return;
    }
    setBusy(true);
    setMessage('正在处理，请稍候...');
    try {
      if (active === 'organize') savePdf(await exportOrganizedPdf(files, organizedPages, exportPrecision), normalizePdfName(exportFileName));
      if (active === 'merge') savePdf(await mergePdfs(files), 'eva-merged.pdf');
      if (active === 'split') downloadBlob(await splitPdf(primaryFile, splitRanges), 'eva-split.zip');
      if (active === 'resize') savePdf(await resizePdf(primaryFile, paper as never, scale), 'eva-resized.pdf');
      if (active === 'crop') savePdf(await cropPdf(primaryFile, margins), 'eva-cropped.pdf');
      if (active === 'rotate') savePdf(await rotatePdf(primaryFile, pages, angle), 'eva-rotated.pdf');
      if (active === 'compress') savePdf(await rasterEffectPdf(primaryFile, 'optimize', rasterScale, quality), 'eva-compressed.pdf');
      if (active === 'reorder') savePdf(await reorderPages(primaryFile, pages), 'eva-reordered.pdf');
      if (active === 'delete') savePdf(await deletePages(primaryFile, pages), 'eva-deleted.pdf');
      if (active === 'numbers') savePdf(await addPageNumbers(primaryFile, { pages, position, size: fontSize, prefix }), 'eva-numbered.pdf');
      if (active === 'nup') savePdf(await nUpPdf(primaryFile, nup), 'eva-nup.pdf');
      if (active === 'pdf-images') downloadBlob(await pdfToImages(primaryFile, imageFormat, rasterScale), 'eva-images.zip');
      if (active === 'images-pdf') savePdf(await imagesToPdf(files), 'eva-images.pdf');
      if (active === 'grayscale') savePdf(await rasterEffectPdf(primaryFile, 'grayscale', rasterScale, quality), 'eva-grayscale.pdf');
      if (active === 'invert') savePdf(await rasterEffectPdf(primaryFile, 'invert', rasterScale, quality), 'eva-inverted.pdf');
      if (active === 'limited') setMessage('这些能力需要本机服务端组件，已在页面中列出替代方案。');
      else setMessage('处理完成，浏览器已开始下载结果。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '处理失败，请换一个文件重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">Local PDF Workspace</p>
          <h1>EVA-PDF</h1>
        </div>
        <div className="header-meta">
          <span>本地处理</span>
          <span>无上传</span>
          <span>页面级编辑</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="tool-list">
          {tools.map((tool) => (
            <button className={tool.id === active ? 'active' : ''} key={tool.id} onClick={() => setActive(tool.id)}>
              <span>{tool.title}</span>
              <small>{tool.desc}</small>
            </button>
          ))}
        </aside>

        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>{currentTool.title}</h2>
              <p>{currentTool.desc}</p>
            </div>
            <button disabled={busy} onClick={run}>{busy ? '处理中...' : '导出文件'}</button>
          </div>

          {active !== 'limited' && (
            <label className="dropzone">
              <input
                multiple
                type="file"
                accept={acceptsImages ? 'image/*' : 'application/pdf'}
                onChange={(event) => void selectFiles(Array.from(event.target.files ?? []))}
              />
              <span>导入{acceptsImages ? '图片' : 'PDF'}文件</span>
              <small>{files.length ? files.map((file) => file.name).join(' / ') : '拖入或选择文件。所有处理均在当前浏览器完成。'}</small>
            </label>
          )}

          {active === 'organize' && (
            <OrganizerControls
              pages={organizedPages}
              precision={exportPrecision}
              fileName={exportFileName}
              selectedPageIds={selectedPageIds}
              setPrecision={setExportPrecision}
              setFileName={setExportFileName}
              setSelectedPageIds={setSelectedPageIds}
              draggedPageId={draggedPageId}
              loading={organizerLoading}
              loadedPreviewPages={loadedPreviewPages}
              setDraggedPageId={setDraggedPageId}
              movePage={moveOrganizedPage}
              updateSelectedPages={updateSelectedPages}
              deleteSelectedPages={deleteSelectedPages}
              deletePage={(id) => {
                setOrganizedPages((currentPages) => currentPages.filter((page) => page.id !== id));
                setSelectedPageIds((currentIds) => currentIds.filter((currentId) => currentId !== id));
              }}
            />
          )}

          {active !== 'organize' && (
            <ToolControls
              active={active}
              pages={pages}
              setPages={setPages}
              splitRanges={splitRanges}
              setSplitRanges={setSplitRanges}
              angle={angle}
              setAngle={setAngle}
              paper={paper}
              setPaper={setPaper}
              scale={scale}
              setScale={setScale}
              margins={margins}
              setMargins={setMargins}
              nup={nup}
              setNup={setNup}
              position={position}
              setPosition={setPosition}
              prefix={prefix}
              setPrefix={setPrefix}
              fontSize={fontSize}
              setFontSize={setFontSize}
              imageFormat={imageFormat}
              setImageFormat={setImageFormat}
              rasterScale={rasterScale}
              setRasterScale={setRasterScale}
              quality={quality}
              setQuality={setQuality}
            />
          )}

          <p className="status">{message}</p>
        </section>
      </section>
    </main>
  );
}

const normalizePdfName = (value: string) => {
  const name = value.trim().replace(/[\\/:*?"<>|]+/g, '-');
  if (!name) return 'eva-organized.pdf';
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
};

function OrganizerControls({
  pages,
  precision,
  fileName,
  selectedPageIds,
  setPrecision,
  setFileName,
  setSelectedPageIds,
  draggedPageId,
  loading,
  loadedPreviewPages,
  setDraggedPageId,
  movePage,
  updateSelectedPages,
  deleteSelectedPages,
  deletePage,
}: {
  pages: OrganizedPage[];
  precision: ExportPrecision;
  fileName: string;
  selectedPageIds: string[];
  setPrecision: (value: ExportPrecision) => void;
  setFileName: (value: string) => void;
  setSelectedPageIds: (value: string[] | ((currentIds: string[]) => string[])) => void;
  draggedPageId: string | null;
  loading: boolean;
  loadedPreviewPages: number;
  setDraggedPageId: (value: string | null) => void;
  movePage: (targetId: string) => void;
  updateSelectedPages: (updater: (page: OrganizedPage) => OrganizedPage) => void;
  deleteSelectedPages: () => void;
  deletePage: (id: string) => void;
}) {
  const selectedCount = selectedPageIds.length;
  const selectedSet = new Set(selectedPageIds);
  const togglePage = (pageId: string) => {
    setSelectedPageIds((currentIds) => currentIds.includes(pageId) ? currentIds.filter((id) => id !== pageId) : [...currentIds, pageId]);
  };
  const rotateSelected = (angle: number) => updateSelectedPages((page) => ({ ...page, rotation: (page.rotation + angle + 360) % 360 }));
  const colorSelected = (colorMode: OrganizedPage['colorMode']) => updateSelectedPages((page) => ({ ...page, colorMode }));
  const cropSelected = (crop: OrganizedPage['crop']) => updateSelectedPages((page) => ({ ...page, crop }));
  const resetSelected = () => updateSelectedPages((page) => ({ ...page, rotation: 0, colorMode: 'normal', crop: { top: 0, right: 0, bottom: 0, left: 0 } }));

  return (
    <div className="organizer">
      <div className="organizer-toolbar">
        <Field label="导出文件名" hint="会自动补全 .pdf，并过滤系统不允许的文件名字符。">
          <input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="例如：合同合并版.pdf" />
        </Field>
        <Field label="导出精度" hint="无损会保留原始 PDF 页面对象；其它档位会栅格化页面以减小体积。">
          <select value={precision} onChange={(event) => setPrecision(event.target.value as ExportPrecision)}>
            <option value="lossless">无损，保留原始页面</option>
            <option value="high">高清，适合打印</option>
            <option value="balanced">均衡，适合分享</option>
            <option value="small">小体积，适合预览</option>
          </select>
        </Field>
        <div className="page-count">
          <strong>{pages.length}</strong>
          <span>当前保留页数</span>
        </div>
      </div>

      <div className="visual-actions">
        <div className="selection-summary">
          <strong>{selectedCount}</strong>
          <span>已选页面</span>
        </div>
        <button type="button" disabled={!pages.length} onClick={() => setSelectedPageIds(pages.map((page) => page.id))}>全选</button>
        <button type="button" disabled={!selectedCount} onClick={() => setSelectedPageIds([])}>取消选择</button>
        <button type="button" disabled={!selectedCount} onClick={() => rotateSelected(90)}>右转 90</button>
        <button type="button" disabled={!selectedCount} onClick={() => rotateSelected(270)}>左转 90</button>
        <button type="button" disabled={!selectedCount} onClick={() => colorSelected('grayscale')}>灰度</button>
        <button type="button" disabled={!selectedCount} onClick={() => colorSelected('invert')}>反色</button>
        <button type="button" disabled={!selectedCount} onClick={() => colorSelected('normal')}>原色</button>
        <button type="button" disabled={!selectedCount} onClick={() => cropSelected({ top: 24, right: 24, bottom: 24, left: 24 })}>裁边 24</button>
        <button type="button" disabled={!selectedCount} onClick={() => cropSelected({ top: 0, right: 0, bottom: 0, left: 0 })}>取消裁剪</button>
        <button type="button" disabled={!selectedCount} onClick={resetSelected}>重置编辑</button>
        <button className="danger-action" type="button" disabled={!selectedCount} onClick={deleteSelectedPages}>删除选中</button>
      </div>

      {loading ? (
        <div className="loading-pages">
          <span className="spinner" />
          <strong>正在生成页面预览</strong>
          <small>已完成 {loadedPreviewPages} 页，PDF 较大时需要等待一会儿。</small>
        </div>
      ) : pages.length === 0 ? (
        <div className="empty-pages">导入一个或多个 PDF 后，这里会显示所有页面缩略图。</div>
      ) : (
        <div className="page-grid">
          {pages.map((page, index) => (
            <article
              className={`page-card ${draggedPageId === page.id ? 'dragging' : ''} ${selectedSet.has(page.id) ? 'selected' : ''}`}
              draggable
              key={page.id}
              onClick={() => togglePage(page.id)}
              onDragStart={() => setDraggedPageId(page.id)}
              onDragEnd={() => setDraggedPageId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => movePage(page.id)}
            >
              <div className="page-thumb">
                <img
                  alt={`${page.fileName} 第 ${page.pageNumber} 页`}
                  className={page.colorMode}
                  src={page.thumbnail}
                  style={{ transform: `rotate(${page.rotation}deg)` }}
                />
              </div>
              <div className="page-badges">
                {selectedSet.has(page.id) && <span>已选</span>}
                {page.rotation !== 0 && <span>{page.rotation}°</span>}
                {page.colorMode !== 'normal' && <span>{page.colorMode === 'grayscale' ? '灰度' : '反色'}</span>}
                {Object.values(page.crop).some((value) => value > 0) && <span>已裁剪</span>}
              </div>
              <div className="page-meta">
                <strong>#{index + 1}</strong>
                <span>{page.fileName}</span>
                <small>原第 {page.pageNumber} 页</small>
              </div>
              <button type="button" onClick={(event) => { event.stopPropagation(); deletePage(page.id); }}>删除</button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

type ControlProps = {
  active: ToolId;
  pages: string;
  setPages: (value: string) => void;
  splitRanges: string;
  setSplitRanges: (value: string) => void;
  angle: number;
  setAngle: (value: number) => void;
  paper: string;
  setPaper: (value: string) => void;
  scale: number;
  setScale: (value: number) => void;
  margins: { top: number; right: number; bottom: number; left: number };
  setMargins: (value: { top: number; right: number; bottom: number; left: number }) => void;
  nup: number;
  setNup: (value: number) => void;
  position: string;
  setPosition: (value: string) => void;
  prefix: string;
  setPrefix: (value: string) => void;
  fontSize: number;
  setFontSize: (value: number) => void;
  imageFormat: 'png' | 'jpeg';
  setImageFormat: (value: 'png' | 'jpeg') => void;
  rasterScale: number;
  setRasterScale: (value: number) => void;
  quality: number;
  setQuality: (value: number) => void;
};

function ToolControls(props: ControlProps) {
  const pageInput = ['split', 'rotate', 'reorder', 'delete', 'numbers'].includes(props.active);
  return (
    <div className="controls">
      {pageInput && props.active !== 'split' && (
        <Field label="页码范围" hint="示例：all、1、1-3、1,3,5-8。重排页面时顺序会按输入保留。">
          <input value={props.pages} onChange={(event) => props.setPages(event.target.value)} />
        </Field>
      )}

      {props.active === 'split' && (
        <Field label="拆分规则" hint="留空表示每页单独导出；多个分组用分号分隔，例如 1-3;4-8;9。">
          <input value={props.splitRanges} onChange={(event) => props.setSplitRanges(event.target.value)} placeholder="1-3;4-8" />
        </Field>
      )}

      {props.active === 'rotate' && (
        <Field label="旋转角度">
          <select value={props.angle} onChange={(event) => props.setAngle(Number(event.target.value))}>
            <option value={90}>顺时针 90 度</option>
            <option value={180}>180 度</option>
            <option value={270}>逆时针 90 度</option>
          </select>
        </Field>
      )}

      {props.active === 'resize' && (
        <>
          <Field label="目标纸张">
            <select value={props.paper} onChange={(event) => props.setPaper(event.target.value)}>
              {['original', 'A4', 'Letter', 'Legal', 'A3', 'A5'].map((size) => <option key={size}>{size}</option>)}
            </select>
          </Field>
          <Field label="内容缩放">
            <input type="number" min="10" max="200" value={props.scale} onChange={(event) => props.setScale(Number(event.target.value))} />
          </Field>
        </>
      )}

      {props.active === 'crop' && (
        <div className="grid-four">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <Field label={`${side} 边距`} key={side}>
              <input type="number" value={props.margins[side]} onChange={(event) => props.setMargins({ ...props.margins, [side]: Number(event.target.value) })} />
            </Field>
          ))}
        </div>
      )}

      {props.active === 'nup' && (
        <Field label="每张纸页数">
          <select value={props.nup} onChange={(event) => props.setNup(Number(event.target.value))}>
            {[2, 4, 6, 8, 9, 12, 16].map((count) => <option key={count} value={count}>{count}-up</option>)}
          </select>
        </Field>
      )}

      {props.active === 'numbers' && (
        <div className="grid-three">
          <Field label="位置">
            <select value={props.position} onChange={(event) => props.setPosition(event.target.value)}>
              <option value="bottomLeft">左下</option>
              <option value="bottomCenter">底部居中</option>
              <option value="bottomRight">右下</option>
              <option value="topLeft">左上</option>
              <option value="topCenter">顶部居中</option>
              <option value="topRight">右上</option>
            </select>
          </Field>
          <Field label="前缀">
            <input value={props.prefix} onChange={(event) => props.setPrefix(event.target.value)} placeholder="Page " />
          </Field>
          <Field label="字号">
            <input type="number" value={props.fontSize} onChange={(event) => props.setFontSize(Number(event.target.value))} />
          </Field>
        </div>
      )}

      {props.active === 'pdf-images' && (
        <Field label="图片格式">
          <select value={props.imageFormat} onChange={(event) => props.setImageFormat(event.target.value as 'png' | 'jpeg')}>
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
          </select>
        </Field>
      )}

      {['compress', 'pdf-images', 'grayscale', 'invert'].includes(props.active) && (
        <div className="grid-two">
          <Field label="渲染倍率" hint="越高越清晰，文件也越大。">
            <input type="number" min="0.5" max="4" step="0.25" value={props.rasterScale} onChange={(event) => props.setRasterScale(Number(event.target.value))} />
          </Field>
          {props.active !== 'pdf-images' && (
            <Field label="JPG 质量">
              <input type="number" min="0.2" max="0.95" step="0.05" value={props.quality} onChange={(event) => props.setQuality(Number(event.target.value))} />
            </Field>
          )}
        </div>
      )}

      {props.active === 'limited' && (
        <div className="limited">
          <h3>浏览器本地页面的限制</h3>
          <p>以下 PDFResizer 功能依赖加密库、Office/电子书转换器或损坏文件恢复工具，纯前端无法稳定完整实现。</p>
          <ul>
            <li>密码保护、移除密码、权限设置：建议后续接入本机 `qpdf` 服务。</li>
            <li>DOCX/XLSX/PPTX/ODT/ePub/MOBI/AZW3/CBR/CBZ 转换：建议接入 LibreOffice、Calibre 或专用 CLI。</li>
            <li>交互式表单填写、修复损坏 PDF、抽取原始嵌入图片：需要更底层 PDF 解析能力。</li>
            <li>当前页面提供可在浏览器内可靠执行的同类功能，并保持离线和隐私优先。</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
