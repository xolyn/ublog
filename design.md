如下是我的一个基于Cloudflare的极简博客系统设计文档

## 系统架构
- workers+D1
- 单js文件设计，方便小白部署 （注意，写法需要遵循cf worker js的语法规范）
- 函数式设计，方便维护和扩展

## 环境变量
- USERNAME 管理员用户名
- PASSWORD 管理员密码
- API_TOKEN 调用所有api的token，可不设置（则不启用Authentication: Bearer <API_TOKEN>）

## binding
- D2: 名称为 `DB`

## 数据库设计
极简设计，只区分管理员和游客，无tags表，评论用valine

1. config表
- title 博客的标题
- about 博客的描述
- seo 博客的关键词
- header html代码，可以接入一些脚本和css
- comment html代码，可以接入valine或者其他系统，和表posts的comments字段联动显示
- footer html代码
- favicon 博客的favicon（url）
- logo 博客的logo（url，但是我目前没有打算在HTML中加上logo，保留字段）
- menu 最特殊的字段，是一个json，key是菜单名称，value是菜单链接。用户可以自行编辑来控制可见性，默认这些：{
    "home": "/index.html",
    "search": "/search.html",
    "tags": "/tags.html",
}
- 404 html代码 用户自定义404页面，默认<b>404</b>
- extra 额外信息，json字符串

这些表的内容都在js中获取出来，存在GLOBAL字典中，字段名不变，如果值是一个json字符串，则parse后存储，让js内部可以随时访问，例如

const GLOBAL={
    "title":xxx
    "about":xxx
    ...
}

2. posts表
- id 文章id
- title 文章标题
- author 文章作者
- content 文章正文(md)
- created 文章创建时间
- modified 文章更新时间
- status 状态：0为默认（可见），1为私人（草稿），2为删除（软删除）
- tags 文章标签，多个标签用逗号分隔，实际以str存储
- comments 是否允许评论，bool和config的comments字段联动
- hash 文章密码的哈希值，为空时代表未上锁
- extra 额外信息，json字符串


## API
- 参数前的*代表必填
- 安全性：所有api调用rpm限制在60 （cf的rate limit实现，不在js中实现）
- 每个api都也是一个函数，方便在js内部调用
- 记得放开cors，允许跨域请求

### get /api/docs
返回：
跳转到另外一个页面（初步设定为此项目的GitHub readme #api 部分）

### get /api/posts
参数：
- kw 关键词，支持搜索，where逻辑为 `concat(title, content) like %kw%`, 为空时返回所有文章
- tag 标签 select ... from posts where tags like %tag%
- sort 排序方式：created, modified, random(这个用于随机推荐)
- order 排序方式：asc, desc
- limit 分页，逻辑在排序后
- offset 分页，逻辑在排序后

返回：
- id 文章id
- title 文章标题
- author 文章作者
- created 文章创建时间
- modified 文章更新时间
- tags 文章标签，多个标签用逗号分隔，实际以str存储

### get /post
参数：
- *id 文章id
- key 文章密码

返回：
- id 文章id
- title 文章标题
- author 文章作者
- content 文章正文(md)
- created 文章创建时间
- modified 文章更新时间
- tags 文章标签，多个标签用逗号分隔，实际以str存储
- comments 是否允许评论，bool
- extra 额外信息，json字符串

### post /post
body：
- id 可以指定id，insert or ignore逻辑，留空数据库自增
- *title 文章标题
- *author 文章作者
- *content 文章正文(md)
- created 文章创建时间
- tags 文章标签，多个标签用逗号分隔，实际以str存储
- comments 是否允许评论，bool
- key 文章密码
- status 状态：同上
- modified 文章更新时间(这个不给用户填，始终为提交时间)

### put /post
body：
- * id 指定id
- title 文章标题
- author 文章作者
- content 文章正文(md)
- created 文章创建时间
- tags 文章标签，多个标签用逗号分隔，实际以str存储
- comments 是否允许评论，bool
- key 文章密码
- status 状态：同上
- modified 文章更新时间(这个不给用户填，前端自动生成然后加入payload)

### delete /post
body：
- * id 指定id

逻辑：
status=2 软删除

### get /tags
参数：
- kw 关键词，支持模糊搜索，where逻辑为 `tags like %kw% `, 为空时返回所有标签

返回：
tag的list，后端逻辑为：select，parse/split comma，去重

不太确定要不要加一个各个tag的count，可能sql有点低性能


### get /config
返回：
config的json

### put /config
body：
config的json，所有字段都可选

## 具体功能设计
- 文章上锁：用一个外层的js函数判断，弹出一个原生prompt("文章已上锁，请输入密码：")，输入key，然后计算hash，对比hash，如果成功则放行，否则报错，这样可以无侵入地套在查看和修改的页面

- 登陆：用原生basicauth

- 渲染：js cdn渲染md，例如参考marked.js

- 模板/块化：在js中，定义许多模板然后组装html，放在开头好编辑的地方，例如const NAV=`<nav>...</nav>`等,便于开发

- 页面组装逻辑
```html
...
{NAV}
...
{GLOBAL.header}
...
{GLOBAL.comment}
{GLOBAL.footer}
...
```

## 页面
> url采用参数，例如/post?id=123，/search?kw=hello，/search?tag=travel
- /index：首页，调用get /posts，然后组装页面，支持排序和分页
- /post：文章页，调用get /post，不传id则404。首轮不传key，如果不报错，证明文章无锁，否则弹出prompt()，再次调用get /post?id=?key=，如果报错，证明密码错误，否则证明文章有锁，循环
- /edit：编辑/新增页，如果没有id参数即为新增，可能调用：get /post?id=，post /post，put /post?id=。同样首轮不传key，如果不报错，证明文章无锁，否则弹出prompt()，再次调用get /post?id=?key=，如果报错，证明密码错误，否则证明文章有锁，循环。key的更新逻辑：不需要获得到“当前key”，只在前端设计一个 checkbox+input，如果勾选checkbox，代表更改，input为空代表取消上锁，不为空代表更改密码（在这我们不需要输入原密码，因为用户刚刚通过basicauth进来）；如果勾选checkbox，input置灰，代表不修改key。
- /search：搜索页，也可以用于展示特定tag下的文章。调用get /posts?tag=，search页不允许排序（虽然api支持）
- /tags：标签页，调用get /tags，然后组装页面
- /admin：管理员页，用basic auth，许多的textarea和input元素，最后两个按钮一个删除一个重置。可能调用：get /config，put /config
- /404：404页面


## 路由
- / -> /index 
- 不存在的页面 -> /404 