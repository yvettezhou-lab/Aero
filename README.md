# Aero ✈️

一个手机优先的航班查看 PWA。

## 功能
- 机场 + 日期
- 出发 / 到达
- 航司筛选
- 航班号 / 机型搜索
- 一键只看宽体
- 本地记住常用机场
- PWA，可添加到 iPhone 主屏幕

## 航班数据
当前接入 AeroDataBox 的机场 FIDS / 航班数据接口。官方文档：https://doc.aerodatabox.com/

在 Vercel 项目环境变量中设置：
`AERODATABOX_API_KEY`

API Key 不放进前端，由 `/api/flights` 服务端代理请求。

## 本地
```
npm install
npm run dev
```
