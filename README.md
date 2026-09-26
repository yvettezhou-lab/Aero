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


## 数据准确性设计

Aero 的航班数据层采用多源可替换设计：
- 主源：AeroDataBox（机场 FIDS、未来/历史航班时刻、航班状态）
- 交叉验证：FlightAware AeroAPI / Cirium FlightStats（按可用 API Key 启用）
- 同一航班按 operating flight / flight identity 去重，避免 codeshare 重复
- 机型分为计划机型与最新/实际机型；两者冲突时显示“机型存在差异”
- 宽体筛选基于标准机型族，而不是简单按航班号猜测

数据源均通过服务端代理，API Key 不进入浏览器。
