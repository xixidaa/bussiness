# 商家收款数据统计管理 H5 系统

基于 Vue 3 + Vite + JavaScript + Element Plus + ECharts 与 Node.js + Express + MongoDB 搭建的商家收款统计系统，支持按年、月、日三种粒度录入和分析收款数据，兼容移动端与 PC 端。

## 现在这版包含什么

- 统计分析模块
- 按年、月、日切换收入统计
- 微信、支付宝、双渠道合计对比
- 收款金额 / 收款人数双维度折线图
- 周期明细与渠道占比展示

- 数据录入模块
- 按年、月、日录入收款记录
- 新增、编辑、删除收款记录
- 同一渠道 + 同一粒度 + 同一周期防重复录入
- 台账筛选与汇总

- 后端能力
- Express RESTful 接口
- MongoDB 持久化
- 默认自动拉起本地嵌入式 MongoDB
- 支持切换到外部 MongoDB 实例
- 统一返回格式、基础参数校验、跨域处理

## 技术方案

前端：

- Vue 3 组合式 API
- Vite
- Element Plus
- ECharts
- 原生 CSS 响应式布局

后端：

- Node.js
- Express
- Mongoose
- MongoDB
- `mongodb-memory-server-core`

## 项目结构

```text
.
├── client
│   ├── src
│   │   ├── App.vue
│   │   ├── api.js
│   │   ├── main.js
│   │   └── styles.css
│   ├── index.html
│   └── vite.config.js
├── server
│   ├── src
│   │   ├── app.js
│   │   ├── routes
│   │   │   └── receipts.js
│   │   ├── seed-data.js
│   │   └── storage.js
│   └── package.json
├── docker-compose.yml
└── package.json
```

## 启动方式

安装依赖：

```bash
npm run install:all
```

启动后端：

```bash
npm run dev:server
```

启动前端：

```bash
npm run dev:client
```

访问地址：

```text
http://localhost:5173
```

后端接口默认地址：

```text
http://localhost:3001
```

## 数据库说明

默认模式：

- 后端未配置 `MONGODB_URI` 时，会自动启动本地嵌入式 MongoDB
- 数据文件目录位于 `server/.mongo-data`
- 适合本地开发和演示环境

外部 MongoDB 模式：

```bash
set MONGODB_URI=mongodb://127.0.0.1:27017/merchant_receipt_statistics
npm run dev:server
```

如果本机 Docker 可用，也可以手动启动独立 Mongo 容器：

```bash
npm run db:start
```

停止容器：

```bash
npm run db:stop
```

## 数据结构

每条记录包含：

```json
{
  "channel": "wechat",
  "granularity": "day",
  "period": "2026-06-07",
  "date": "2026-06-07",
  "amount": 1410,
  "people": 14
}
```

字段说明：

- `channel`：`wechat` / `alipay`
- `granularity`：`year` / `month` / `day`
- `period`：对应粒度的统计周期
- `date`：后端统一落库的标准日期字段
- `amount`：收款金额
- `people`：收款人数

## 接口说明

统一返回格式：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

接口列表：

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/receipts` | 查询记录列表，支持 `granularity`、`period`、`channel`、`parentPeriod` |
| GET | `/api/receipts/single` | 按粒度 + 周期 + 渠道查询单类记录 |
| GET | `/api/receipts/summary` | 获取某粒度某周期汇总 |
| GET | `/api/receipts/trend` | 获取趋势图数据 |
| POST | `/api/receipts` | 新增记录 |
| PUT | `/api/receipts/:id` | 修改记录 |
| DELETE | `/api/receipts/:id` | 删除记录 |

### 1. 查询记录

```text
GET /api/receipts?granularity=day&period=2026-06-07&channel=wechat
```

### 2. 获取汇总

```text
GET /api/receipts/summary?dimension=month&period=2026-06
```

### 3. 获取趋势

```text
GET /api/receipts/trend?dimension=day&parentPeriod=2026-06
```

### 4. 新增记录

```json
{
  "channel": "alipay",
  "granularity": "month",
  "period": "2026-06",
  "amount": 18620,
  "people": 134
}
```

## 构建

前端构建：

```bash
npm run build
```

后端生产启动：

```bash
npm run start
```

## 当前实现细节

- 页面已拆分为 `统计分析` 与 `数据录入` 两个主模块
- 年、月、日三种统计粒度前后端已打通
- 默认内置示例数据，首次启动会自动写入数据库
- 前端已做移动端优先适配，同时兼容桌面端宽屏展示
