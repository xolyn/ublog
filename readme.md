
# ublog-cf — Cloudflare Worker + D1
wrangler.toml 需绑定: [[d1_databases]] binding = "DB"
环境变量: USERNAME, PASSWORD, 可选 API_TOKEN
初始化 D1（在仓库根目录执行一次）:
wrangler d1 execute DB --local --file=./schema.sql
-- schema.sql（仅建表；默认内容由 Worker 首次启动时注入，避免 SQL 字面量转义 HTML/单引号）--
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL DEFAULT '',
  about TEXT DEFAULT '',
  seo TEXT DEFAULT '',
  header TEXT DEFAULT '',
  comment TEXT DEFAULT '',
  footer TEXT DEFAULT '',
  favicon TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  menu TEXT DEFAULT '',
  page404 TEXT DEFAULT '',
  extra TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL,
  modified TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  tags TEXT DEFAULT '',
  comments INTEGER NOT NULL DEFAULT 1,
  hash TEXT DEFAULT '',
  extra TEXT DEFAULT '{}'
);
INSERT OR IGNORE INTO config (id) VALUES (1);



# features（用于landing page）
- REST API
- 文章上锁
- 可扩展的评论系统
- markdown WYSIWYG沉浸式写作
- 高度自定义的header footer，404页面
- 方便且多样的管理员设置
- 傻瓜式0成本部署
- 仅两张表，<50K的前+后端代码，极致轻量
- 极简，但功能齐全的博客CMS