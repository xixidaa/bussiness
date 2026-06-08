# Cloudflare Pages 部署说明

## 一、项目部署概览

当前项目在线上使用的是 Cloudflare 的全栈部署方案，包含三部分：

- 前端：Vite 打包后的静态站点
- 接口：Cloudflare Pages Functions
- 数据库：Cloudflare D1

也就是说：

- 本地开发仍然可以继续使用 `server/` 里的 Express + MongoDB 方案
- 线上部署时不再依赖本地 Node 服务
- 前端访问的 `/api/*` 请求会直接由 Cloudflare Functions 处理

## 二、线上部署用到的目录和文件

- 前端源码目录：`client/`
- 前端构建产物目录：`client/dist`
- Cloudflare Functions 目录：`functions/`
- 线上接口共享逻辑：`functions/_shared/receipts.js`
- Cloudflare 配置文件：`wrangler.toml`
- 根目录构建脚本：`package.json`
- 构建前依赖检查脚本：`scripts/ensure-client-deps.js`

## 三、Cloudflare 上的运行原理

### 1. 前端是如何运行的

Cloudflare Pages 会执行根目录构建命令：

```bash
npm run build
```

这条命令实际会先执行：

```bash
node scripts/ensure-client-deps.js
```

然后再执行：

```bash
npm run build --prefix client
```

最后由 Vite 输出静态文件到：

```text
client/dist
```

Cloudflare Pages 会把 `client/dist` 作为最终站点内容对外提供访问。

### 2. 接口是如何运行的

Cloudflare Pages 会自动识别项目根目录下的 `functions/` 目录，并把里面的文件当成服务端接口路由。

例如：

- `functions/api/health.js` 对应 `/api/health`
- `functions/api/receipts/index.js` 对应 `/api/receipts`
- `functions/api/receipts/[id].js` 对应 `/api/receipts/:id`

所以线上前端请求：

```text
/api/receipts/summary
```

时，不会再去找本地 Express 服务，而是直接进入 Cloudflare Functions。

### 3. D1 数据库是如何接入的

Cloudflare 会把 D1 数据库通过 binding 注入到 Functions 运行时中。

代码里通过下面的方式读取数据库：

```js
context.env.DB
```

这也是为什么 `wrangler.toml` 里的 binding 名必须写成：

```toml
binding = "DB"
```

### 4. 数据库为什么可以首次访问自动可用

线上接口逻辑在 `functions/_shared/receipts.js` 中实现。

每次接口请求进入时，会先执行数据库初始化逻辑，主要做三件事：

1. 检查 `DB` 绑定是否存在
2. 如果表不存在，就自动建表和建索引
3. 如果表为空，就自动写入示例数据

所以新建一个空的 D1 数据库后，首次访问接口时也能自动初始化。

## 四、当前 Cloudflare 配置

当前项目使用的 `wrangler.toml` 配置如下：

```toml
name = "merchant-receipt-statistics"
pages_build_output_dir = "client/dist"
compatibility_date = "2026-06-08"

[[d1_databases]]
binding = "DB"
database_name = "merchant-receipt-statistics"
database_id = "6c1556c0-4945-44a0-a451-0cd873806725"

[[env.preview.d1_databases]]
binding = "DB"
database_name = "merchant-receipt-statistics"
database_id = "6c1556c0-4945-44a0-a451-0cd873806725"

[[env.production.d1_databases]]
binding = "DB"
database_name = "merchant-receipt-statistics"
database_id = "6c1556c0-4945-44a0-a451-0cd873806725"
```

这里同时声明了：

- 顶层 `d1_databases`
- `env.preview.d1_databases`
- `env.production.d1_databases`

这样做的原因是：

- Cloudflare Pages 的预览环境和正式环境有时不会按预期共享绑定
- 显式声明两个环境可以避免 `DB` 绑定只在其中一个环境可用的问题

## 五、详细部署步骤

### 第 1 步：把代码推送到 GitHub

Cloudflare Pages 最方便的方式是直接连接 GitHub 仓库，所以需要先把项目推到远程仓库。

### 第 2 步：在 Cloudflare 创建 D1 数据库

进入 Cloudflare 控制台后：

1. 打开 `Workers & Pages`
2. 找到 `D1`
3. 创建一个新的数据库

当前项目使用的数据库名称是：

```text
merchant-receipt-statistics
```

如果以后要更换数据库，记得同步更新 `wrangler.toml` 里的 `database_id`。

### 第 3 步：创建 Pages 项目并连接 GitHub 仓库

进入 Cloudflare 控制台后：

1. 打开 `Workers & Pages`
2. 点击 `Create application`
3. 选择 `Pages`
4. 选择 `Connect to Git`
5. 选择对应的 GitHub 仓库

### 第 4 步：配置构建参数

在 Pages 构建设置里填写：

- Build command：`npm run build`
- Build output directory：`client/dist`
- Root directory：仓库根目录

注意：

- 不要把 Root directory 设置成 `client`
- 因为 `functions/` 在仓库根目录
- 如果根目录切到 `client`，Cloudflare 就识别不到 Functions

### 第 5 步：通过 `wrangler.toml` 管理 D1 绑定

当前项目的 D1 绑定不是在 Cloudflare 控制台里手工配置，而是由 `wrangler.toml` 管理。

这意味着：

- Cloudflare 控制台里可能会提示“此项目的绑定通过 wrangler.toml 管理”
- 这是正常现象
- 以后如果更换数据库，需要修改 `wrangler.toml`

### 第 6 步：触发部署

完成以上配置后：

- 可以在 Cloudflare 控制台手动重新部署
- 或者直接向 GitHub 推送新的 commit 触发自动部署

### 第 7 步：部署完成后验证

建议按下面顺序验证：

1. 访问：

```text
https://你的域名/api/health
```

2. 再访问：

```text
https://你的域名/api/receipts/summary?dimension=year&period=2026
```

3. 最后打开首页，确认图表、汇总和台账都能正常显示

## 六、为什么根目录加了 `prebuild`

线上部署时，Cloudflare 是在一个新的构建环境中运行命令。

最开始遇到过一个报错：

```text
sh: 1: vite: not found
```

原因是：

- `vite` 安装在 `client/node_modules`
- 根目录构建命令会进一步调用 `client` 的构建
- 但 Cloudflare 的构建环境不一定已经具备 `client` 依赖

为了解决这个问题，根目录 `package.json` 中加入了：

```json
"prebuild": "node scripts/ensure-client-deps.js"
```

这个脚本会先检查 `client/node_modules/vite` 是否存在：

- 如果存在，就直接跳过
- 如果不存在，就自动安装前端依赖

这样可以保证 Vite 在线上构建时一定可用。

## 七、为什么线上不用 MongoDB，而改用 D1

### 本地开发模式

本地原来的后端依赖：

- Express
- MongoDB
- `mongodb-memory-server-core`

这套方案适合普通 Node 开发环境。

### Cloudflare 线上模式

Cloudflare Pages 不是传统的 Node 服务器托管平台，它更适合：

- 托管静态资源
- 运行边缘函数
- 使用 Cloudflare 自家的存储能力，比如 D1

所以线上部署时，把接口迁移到了：

- `functions/api/*`
- D1 存储

### MongoDB 和 SQLite/D1 的区别会不会有影响

会有影响，但影响主要集中在底层实现，不影响前端使用方式。

有影响的部分包括：

- 建表方式
- 索引方式
- 查询语法
- 数据类型行为

不受影响的部分包括：

- 前端接口路径
- 前端请求方式
- 接口返回结构

因为我们保留了相同的 `/api/*` 协议，前端基本不需要感知数据库从 MongoDB 变成了 D1。

## 八、这次部署过程中遇到的坑总结

### 1. `wrangler.toml` 缺少 `name`

报错现象：

```text
Missing top-level field "name" in configuration file
```

原因：

- Cloudflare 读取 `wrangler.toml` 时要求有顶层 `name`

解决方式：

- 在 `wrangler.toml` 中加入：

```toml
name = "merchant-receipt-statistics"
```

### 2. Cloudflare 构建时找不到 `vite`

报错现象：

```text
sh: 1: vite: not found
```

原因：

- 根目录构建调用了客户端构建
- 但 Cloudflare 构建环境中客户端依赖没有准备好

解决方式：

- 加入 `prebuild`
- 加入 `scripts/ensure-client-deps.js`

### 3. D1 绑定不能在控制台里手动添加

报错现象：

- Cloudflare 控制台提示此项目绑定由 `wrangler.toml` 管理

原因：

- 该项目已经切换为配置文件接管绑定

解决方式：

- 不再尝试在控制台里手动绑定
- 直接在 `wrangler.toml` 中配置 D1

### 4. 明明写了 D1 绑定，接口仍提示 `DB is not configured`

报错现象：

```text
D1 binding DB is not configured
```

原因：

- 预览环境和正式环境的绑定可能没有按预期继承

解决方式：

- 同时配置顶层、`preview`、`production` 三处 D1 绑定

### 5. 前端打包成功，但 Functions 阶段失败

现象：

- Vite 构建已经完成
- 但 Cloudflare 在 Functions 打包或运行阶段报错

原因：

- `functions/api/*` 里的相对导入路径有误

解决方式：

- 修正 Functions 文件中的相对导入路径

### 6. 数据库初始化没有在每个接口前执行

现象：

- 请求已到达接口
- 但表还没创建，或者数据库还没初始化

解决方式：

- 每个 Functions 路由在处理业务前先执行 `ensureDatabase(db)`

### 7. Cloudflare 只显示泛化 Worker 错误，不显示具体原因

报错现象：

```text
A Worker script configured by the website owner threw an unhandled exception
```

原因：

- 原始异常直接抛给了 Cloudflare

解决方式：

- 增加 `requireDatabase(env)` 检查
- 增加 `withErrorHandling(task)` 包装
- 接口现在会尽量返回 JSON 错误信息，便于定位问题

### 8. D1 建表时报 `SQLITE_ERROR`

报错现象：

```text
D1_EXEC_ERROR: Error in line 1: CREATE TABLE IF NOT EXISTS receipts (: incomplete input: SQLITE_ERROR
```

原因：

- D1 对原来的 DDL 执行方式不够稳定
- 多行 SQL 加上执行方式导致解析失败

解决方式：

- 把建表 SQL 压成单行
- 改成使用 `db.prepare(statement).run()` 逐条执行

## 九、推荐的部署后检查清单

每次部署完成后，建议按这个顺序检查：

1. `/api/health` 是否正常
2. `/api/receipts/summary?dimension=year&period=2026` 是否返回数据
3. 首页是否能正常显示统计图表
4. 新增记录是否正常
5. 编辑记录是否正常
6. 删除记录是否正常
7. Excel 导入是否正常

## 十、后续维护建议

- 如果以后更换 D1 数据库，需要更新 `wrangler.toml` 里的 `database_id`
- 如果预览环境和正式环境行为不一致，先检查 `env.preview` 和 `env.production` 配置
- 如果前端能构建成功但接口异常，优先排查 `functions/` 和 D1 绑定配置
- 如果发现线上数据突然为空，先确认是不是切到了一个新的空 D1 数据库

## 十一、相关文件

- `wrangler.toml`
- `package.json`
- `scripts/ensure-client-deps.js`
- `functions/_shared/receipts.js`
- `functions/api/health.js`
- `functions/api/receipts/index.js`
- `functions/api/receipts/[id].js`
