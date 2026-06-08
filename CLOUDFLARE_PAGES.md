# Cloudflare Pages Deploy

这是这套项目最省事的线上方案。

## 你需要创建的资源

1. 一个 Cloudflare Pages 项目
2. 一个 D1 数据库
3. 在 Pages 项目里把 D1 绑定名设为 `DB`

## 构建配置

- Build command: `npm run build`
- Build output directory: `client/dist`
- Root directory: 仓库根目录

## 函数路由

项目已经把 API 迁到 `functions/api/*`，前端继续请求 `/api/...`，部署到 Pages 后会自动走同域接口。

## 数据初始化

第一次访问时，D1 会自动建表并把当前示例数据写进去，所以你不需要手工导入初始数据。

## 部署顺序

1. 在 Cloudflare 创建 D1
2. 在 Pages 创建项目，连接这个仓库
3. 配好构建命令和输出目录
4. 给 Pages 项目绑定 D1，变量名用 `DB`
5. 部署

## 本地预览

如果你想本地先看静态产物，先跑：

```bash
npm run build
```

然后把 `client/dist` 当成 Pages 的发布目录即可。
