import { PDFDocument, PageSizes, StandardFonts, degrees, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export type PageRange = number[];
export type ImageFormat = 'png' | 'jpeg';
export type OrganizedPage = {
  id: string;
  fileIndex: number;
  pageIndex: number;
  pageNumber: number;
  fileName: string;
  thumbnail: string;
  rotation: number;
  colorMode: 'normal' | 'grayscale' | 'invert';
  crop: { top: number; right: number; bottom: number; left: number };
};

export type ExportPrecision = 'lossless' | 'high' | 'balanced' | 'small';

export const paperSizes = {
  original: null,
  A4: PageSizes.A4,
  Letter: PageSizes.Letter,
  Legal: PageSizes.Legal,
  A3: PageSizes.A3,
  A5: PageSizes.A5,
} as const;

export const parsePages = (input: string, totalPages: number): PageRange => {
  const value = input.trim();
  if (!value || value.toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const pages = new Set<number>();
  for (const segment of value.split(',')) {
    const part = segment.trim();
    if (!part) continue;
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`无法解析页码范围：${part}`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > totalPages) {
      throw new Error(`页码超出范围：${part}`);
    }
    for (let page = start; page <= end; page += 1) pages.add(page - 1);
  }
  return [...pages].sort((a, b) => a - b);
};

export const parsePageOrder = (input: string, totalPages: number): PageRange => {
  const value = input.trim();
  if (!value || value.toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const pages: number[] = [];
  for (const segment of value.split(',')) {
    const part = segment.trim();
    if (!part) continue;
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`无法解析页码范围：${part}`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > totalPages) {
      throw new Error(`页码超出范围：${part}`);
    }
    for (let page = start; page <= end; page += 1) pages.push(page - 1);
  }
  return pages;
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const savePdf = (bytes: Uint8Array, filename: string) => {
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename);
};

const readFile = (file: File) => file.arrayBuffer();

const createPdfFromSelectedPages = async (file: File, selectedPages: number[]) => {
  const source = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, selectedPages);
  copied.forEach((page) => output.addPage(page));
  return output;
};

export const getPageCount = async (file: File) => {
  const pdf = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  return pdf.getPageCount();
};

export const mergePdfs = async (files: File[]) => {
  const output = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
    const copied = await output.copyPages(source, source.getPageIndices());
    copied.forEach((page) => output.addPage(page));
  }
  return output.save({ useObjectStreams: true });
};

export const loadOrganizedPages = async (files: File[], onProgress?: (loadedPages: number) => void) => {
  const pages: OrganizedPage[] = [];
  for (const [fileIndex, file] of files.entries()) {
    const data = new Uint8Array(await file.arrayBuffer());
    const task = pdfjsLib.getDocument({ data, disableWorker: true });
    const pdf = await task.promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const thumbnail = await renderThumbnail(pdf, pageNumber);
      pages.push({
        id: `${fileIndex}-${pageNumber}-${file.name}-${file.lastModified}`,
        fileIndex,
        pageIndex: pageNumber - 1,
        pageNumber,
        fileName: file.name,
        thumbnail,
        rotation: 0,
        colorMode: 'normal',
        crop: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      onProgress?.(pages.length);
    }
    await pdf.cleanup();
  }
  return pages;
};

const renderThumbnail = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
  try {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(0.42, 170 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建缩略图。');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return createThumbnailFallback(pageNumber);
  }
};

const createThumbnailFallback = (pageNumber: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 150;
  canvas.height = 210;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#d5dbe6';
  context.lineWidth = 2;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  context.fillStyle = '#182033';
  context.font = '700 18px sans-serif';
  context.textAlign = 'center';
  context.fillText(`第 ${pageNumber} 页`, canvas.width / 2, canvas.height / 2);
  context.fillStyle = '#7a8394';
  context.font = '12px sans-serif';
  context.fillText('预览不可用', canvas.width / 2, canvas.height / 2 + 24);
  return canvas.toDataURL('image/jpeg', 0.82);
};

export const exportOrganizedPdf = async (files: File[], pages: OrganizedPage[], precision: ExportPrecision) => {
  if (precision === 'lossless') {
    const output = await PDFDocument.create();
    const documents = await Promise.all(files.map(async (file) => PDFDocument.load(await readFile(file), { ignoreEncryption: true })));
    const copiedPages = new Map<string, Awaited<ReturnType<typeof output.copyPages>>[number]>();
    const untouchedPages = pages.filter((page) => !hasPageEdit(page));

    for (const [fileIndex, document] of documents.entries()) {
      const sourcePageIndexes = [...new Set(untouchedPages.filter((page) => page.fileIndex === fileIndex).map((page) => page.pageIndex))];
      if (!sourcePageIndexes.length) continue;
      const copied = await output.copyPages(document, sourcePageIndexes);
      sourcePageIndexes.forEach((pageIndex, index) => {
        copiedPages.set(`${fileIndex}:${pageIndex}`, copied[index]);
      });
    }

    for (const pageRef of pages) {
      if (requiresRasterExport(pageRef)) {
        await addRasterizedPage(output, documents[pageRef.fileIndex], files[pageRef.fileIndex], pageRef, { scale: 2.2, quality: 0.92 });
        continue;
      }
      const copied = copiedPages.get(`${pageRef.fileIndex}:${pageRef.pageIndex}`) ?? (await output.copyPages(documents[pageRef.fileIndex], [pageRef.pageIndex]))[0];
      if (!copied) throw new Error('导出页面映射失败。');
      applyLosslessPageEdits(copied, pageRef);
      output.addPage(copied);
    }
    return output.save({ useObjectStreams: true });
  }

  const settings = {
    high: { scale: 2.2, quality: 0.9 },
    balanced: { scale: 1.5, quality: 0.76 },
    small: { scale: 1, quality: 0.56 },
  }[precision];
  const output = await PDFDocument.create();
  const documents = await Promise.all(files.map(async (file) => PDFDocument.load(await readFile(file), { ignoreEncryption: true })));
  for (const pageRef of pages) {
    await addRasterizedPage(output, documents[pageRef.fileIndex], files[pageRef.fileIndex], pageRef, settings);
  }
  return output.save({ useObjectStreams: true });
};

const hasPageEdit = (page: OrganizedPage) => page.rotation !== 0 || page.colorMode !== 'normal' || Object.values(page.crop).some((value) => value > 0);

const requiresRasterExport = (page: OrganizedPage) => page.colorMode !== 'normal';

const applyLosslessPageEdits = (page: Awaited<ReturnType<PDFDocument['copyPages']>>[number], pageRef: OrganizedPage) => {
  if (pageRef.rotation) {
    page.setRotation(degrees((page.getRotation().angle + pageRef.rotation) % 360));
  }
  if (Object.values(pageRef.crop).some((value) => value > 0)) {
    const { width, height } = page.getSize();
    page.setCropBox(
      pageRef.crop.left,
      pageRef.crop.bottom,
      Math.max(1, width - pageRef.crop.left - pageRef.crop.right),
      Math.max(1, height - pageRef.crop.top - pageRef.crop.bottom),
    );
  }
};

const addRasterizedPage = async (
  output: PDFDocument,
  source: PDFDocument,
  file: File,
  pageRef: OrganizedPage,
  settings: { scale: number; quality: number },
) => {
  const original = source.getPage(pageRef.pageIndex).getSize();
  const canvas = await renderEditedPageCanvas(file, pageRef, settings.scale);
  const jpg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('页面导出失败。'))), 'image/jpeg', settings.quality));
  const embedded = await output.embedJpg(await jpg.arrayBuffer());
  const croppedWidth = Math.max(1, original.width - pageRef.crop.left - pageRef.crop.right);
  const croppedHeight = Math.max(1, original.height - pageRef.crop.top - pageRef.crop.bottom);
  const rotated = pageRef.rotation % 180 !== 0;
  const page = output.addPage(rotated ? [croppedHeight, croppedWidth] : [croppedWidth, croppedHeight]);
  page.drawImage(embedded, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
};

const renderEditedPageCanvas = async (file: File, pageRef: OrganizedPage, scale: number) => {
  const rendered = await renderPdfPage(file, pageRef.pageIndex + 1, scale);
  const cropped = cropCanvas(rendered, {
    top: pageRef.crop.top * scale,
    right: pageRef.crop.right * scale,
    bottom: pageRef.crop.bottom * scale,
    left: pageRef.crop.left * scale,
  });
  applyCanvasColorMode(cropped, pageRef.colorMode);
  return rotateCanvas(cropped, pageRef.rotation);
};

const cropCanvas = (canvas: HTMLCanvasElement, crop: { top: number; right: number; bottom: number; left: number }) => {
  const next = document.createElement('canvas');
  const sourceX = Math.max(0, Math.floor(crop.left));
  const sourceY = Math.max(0, Math.floor(crop.top));
  const width = Math.max(1, Math.floor(canvas.width - crop.left - crop.right));
  const height = Math.max(1, Math.floor(canvas.height - crop.top - crop.bottom));
  next.width = width;
  next.height = height;
  const context = next.getContext('2d');
  if (!context) throw new Error('浏览器无法裁剪页面。');
  context.drawImage(canvas, sourceX, sourceY, width, height, 0, 0, width, height);
  return next;
};

const applyCanvasColorMode = (canvas: HTMLCanvasElement, colorMode: OrganizedPage['colorMode']) => {
  if (colorMode === 'normal') return;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理页面颜色。');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const r = imageData.data[index];
    const g = imageData.data[index + 1];
    const b = imageData.data[index + 2];
    if (colorMode === 'grayscale') {
      const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
      imageData.data[index] = gray;
      imageData.data[index + 1] = gray;
      imageData.data[index + 2] = gray;
    } else {
      imageData.data[index] = 255 - r;
      imageData.data[index + 1] = 255 - g;
      imageData.data[index + 2] = 255 - b;
    }
  }
  context.putImageData(imageData, 0, 0);
};

const rotateCanvas = (canvas: HTMLCanvasElement, rotation: number) => {
  const normalized = ((rotation % 360) + 360) % 360;
  if (!normalized) return canvas;
  const next = document.createElement('canvas');
  const rotated = normalized === 90 || normalized === 270;
  next.width = rotated ? canvas.height : canvas.width;
  next.height = rotated ? canvas.width : canvas.height;
  const context = next.getContext('2d');
  if (!context) throw new Error('浏览器无法旋转页面。');
  context.translate(next.width / 2, next.height / 2);
  context.rotate((normalized * Math.PI) / 180);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return next;
};

export const splitPdf = async (file: File, ranges: string) => {
  const source = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const zip = new JSZip();
  const totalPages = source.getPageCount();
  const chunks = ranges.trim() ? ranges.split(';') : Array.from({ length: totalPages }, (_, index) => `${index + 1}`);

  for (const chunk of chunks) {
    const selected = parsePages(chunk, totalPages);
    const output = await createPdfFromSelectedPages(file, selected);
    zip.file(`${file.name.replace(/\.pdf$/i, '')}_${chunk.replace(/[^\d-]+/g, '_')}.pdf`, await output.save());
  }

  return zip.generateAsync({ type: 'blob' });
};

export const deletePages = async (file: File, pagesInput: string) => {
  const source = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const total = source.getPageCount();
  const deleteSet = new Set(parsePages(pagesInput, total));
  const keep = source.getPageIndices().filter((index) => !deleteSet.has(index));
  return createPdfFromSelectedPages(file, keep).then((pdf) => pdf.save({ useObjectStreams: true }));
};

export const reorderPages = async (file: File, orderInput: string) => {
  const source = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const order = parsePageOrder(orderInput, source.getPageCount());
  return createPdfFromSelectedPages(file, order).then((pdf) => pdf.save({ useObjectStreams: true }));
};

export const rotatePdf = async (file: File, pagesInput: string, angle: number) => {
  const pdf = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const selected = new Set(parsePages(pagesInput, pdf.getPageCount()));
  pdf.getPages().forEach((page, index) => {
    if (!selected.has(index)) return;
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + angle) % 360));
  });
  return pdf.save({ useObjectStreams: true });
};

export const cropPdf = async (file: File, margins: { top: number; right: number; bottom: number; left: number }) => {
  const pdf = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  pdf.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const x = margins.left;
    const y = margins.bottom;
    const nextWidth = Math.max(1, width - margins.left - margins.right);
    const nextHeight = Math.max(1, height - margins.top - margins.bottom);
    page.setCropBox(x, y, nextWidth, nextHeight);
  });
  return pdf.save({ useObjectStreams: true });
};

export const resizePdf = async (file: File, paper: keyof typeof paperSizes, scalePercent: number) => {
  const source = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const output = await PDFDocument.create();
  for (const index of source.getPageIndices()) {
    const [embedded] = await output.embedPdf(await readFile(file), [index]);
    const original = source.getPage(index).getSize();
    const target = paperSizes[paper] ?? [original.width, original.height];
    const page = output.addPage(target);
    const ratio = Math.min(target[0] / original.width, target[1] / original.height) * (scalePercent / 100);
    const width = original.width * ratio;
    const height = original.height * ratio;
    page.drawPage(embedded, { x: (target[0] - width) / 2, y: (target[1] - height) / 2, width, height });
  }
  return output.save({ useObjectStreams: true });
};

export const addPageNumbers = async (file: File, options: { pages: string; position: string; size: number; prefix: string }) => {
  const pdf = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const selected = new Set(parsePages(options.pages, pdf.getPageCount()));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.getPages().forEach((page, index) => {
    if (!selected.has(index)) return;
    const { width, height } = page.getSize();
    const label = `${options.prefix}${index + 1}`;
    const textWidth = font.widthOfTextAtSize(label, options.size);
    const positions: Record<string, [number, number]> = {
      bottomLeft: [36, 24],
      bottomCenter: [(width - textWidth) / 2, 24],
      bottomRight: [width - textWidth - 36, 24],
      topLeft: [36, height - 36],
      topCenter: [(width - textWidth) / 2, height - 36],
      topRight: [width - textWidth - 36, height - 36],
    };
    const [x, y] = positions[options.position] ?? positions.bottomCenter;
    page.drawText(label, { x, y, size: options.size, font, color: rgb(0.08, 0.1, 0.16) });
  });
  return pdf.save({ useObjectStreams: true });
};

export const nUpPdf = async (file: File, perSheet: number) => {
  const bytes = await readFile(file);
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const output = await PDFDocument.create();
  const columns = Math.ceil(Math.sqrt(perSheet));
  const rows = Math.ceil(perSheet / columns);
  const [sheetWidth, sheetHeight] = PageSizes.A4;

  let sheet = output.addPage(PageSizes.A4);
  for (const index of source.getPageIndices()) {
    if (index > 0 && index % perSheet === 0) sheet = output.addPage(PageSizes.A4);
    const [embedded] = await output.embedPdf(bytes, [index]);
    const slot = index % perSheet;
    const col = slot % columns;
    const row = Math.floor(slot / columns);
    const cellWidth = sheetWidth / columns;
    const cellHeight = sheetHeight / rows;
    const original = source.getPage(index).getSize();
    const ratio = Math.min(cellWidth / original.width, cellHeight / original.height) * 0.94;
    const width = original.width * ratio;
    const height = original.height * ratio;
    sheet.drawPage(embedded, {
      x: col * cellWidth + (cellWidth - width) / 2,
      y: sheetHeight - (row + 1) * cellHeight + (cellHeight - height) / 2,
      width,
      height,
    });
  }
  return output.save({ useObjectStreams: true });
};

export const imagesToPdf = async (files: File[]) => {
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const bytes = file.type.includes('png') || file.type.includes('jpeg') || file.type.includes('jpg')
      ? await file.arrayBuffer()
      : await rasterizeImage(file);
    const image = file.type.includes('jpeg') || file.type.includes('jpg') ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  return pdf.save({ useObjectStreams: true });
};

const rasterizeImage = async (file: File) => {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建 Canvas。');
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('图片转换失败。'))), 'image/png'));
    return blob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
};

const renderPdfPage = async (file: File, pageNumber: number, scale: number) => {
  const data = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data });
  const pdf = await task.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建 Canvas。');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
};

export const pdfToImages = async (file: File, format: ImageFormat, scale: number) => {
  const pdf = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const zip = new JSZip();
  for (let page = 1; page <= pdf.getPageCount(); page += 1) {
    const canvas = await renderPdfPage(file, page, scale);
    const type = format === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('图片导出失败。'))), type, 0.88));
    zip.file(`${file.name.replace(/\.pdf$/i, '')}_${page}.${format === 'png' ? 'png' : 'jpg'}`, blob);
  }
  return zip.generateAsync({ type: 'blob' });
};

export const rasterEffectPdf = async (file: File, mode: 'grayscale' | 'invert' | 'optimize', scale: number, quality: number) => {
  const source = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const output = await PDFDocument.create();
  for (let pageNumber = 1; pageNumber <= source.getPageCount(); pageNumber += 1) {
    const canvas = await renderPdfPage(file, pageNumber, scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法读取 Canvas。');
    if (mode !== 'optimize') {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < imageData.data.length; index += 4) {
        const r = imageData.data[index];
        const g = imageData.data[index + 1];
        const b = imageData.data[index + 2];
        if (mode === 'grayscale') {
          const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
          imageData.data[index] = gray;
          imageData.data[index + 1] = gray;
          imageData.data[index + 2] = gray;
        } else {
          imageData.data[index] = 255 - r;
          imageData.data[index + 1] = 255 - g;
          imageData.data[index + 2] = 255 - b;
        }
      }
      context.putImageData(imageData, 0, 0);
    }
    const jpg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PDF 栅格化失败。'))), 'image/jpeg', quality));
    const embedded = await output.embedJpg(await jpg.arrayBuffer());
    const original = source.getPage(pageNumber - 1).getSize();
    const page = output.addPage([original.width, original.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: original.width, height: original.height });
  }
  return output.save({ useObjectStreams: true });
};
