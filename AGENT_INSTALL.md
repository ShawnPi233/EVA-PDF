# Agent 一键安装

面向自动化 Agent、远程开发机或全新本地环境的快速安装说明。

## 一键安装并启动

```bash
git clone https://github.com/ShawnPi233/EVA-PDF.git && cd EVA-PDF && npm install && npm run dev -- --host 0.0.0.0
```

启动后访问终端输出的本地地址，通常是：

```text
http://localhost:5173/
```

## 一键安装并构建

```bash
git clone https://github.com/ShawnPi233/EVA-PDF.git && cd EVA-PDF && npm install && npm run build
```

构建产物位于 `dist/`。

## Agent 执行建议

- 使用 Node.js 20 或更高版本。
- 优先使用 Linux/macOS 原生 Node.js 环境。
- 在 WSL 中避免使用 Windows 版 `node`/`npm` 直接操作 `\\wsl.localhost` 路径。
- 如果端口 `5173` 被占用，Vite 会自动切换到下一个可用端口。

## 验证命令

```bash
npm run build
```

如果构建通过，即可认为依赖安装和前端代码编译正常。
