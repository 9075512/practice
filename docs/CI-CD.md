# CI/CD 说明

> 流水线定义：`.github/workflows/ci.yml`

## 分支模型

```
feature/*  ──PR──▶  dev  ──PR──▶  main
                     │              │
                  自动测试        自动测试
                  自动部署        自动部署
                 （测试环境）    （生产环境）
```

| 分支 | 定位 | 写入方式 | 部署目标 |
| --- | --- | --- | --- |
| `main` | 正式分支，只存放已上线代码 | **只接受来自 `dev` 的 PR** | 生产环境 |
| `dev` | 开发分支，日常集成 | **只接受 PR**，禁止直接 push | 测试环境 |

两条分支都开了分支保护：禁止直接 push、禁止 force push、禁止删除，且必须通过 `test` 检查才能合并。`main` 额外要求 `source-guard` 检查（校验 PR 来源必须是 `dev`），管理员也不能绕过。

## 触发矩阵

| 事件 | `test` | `source-guard` | `deploy-dev` | `deploy-prod` |
| --- | --- | --- | --- | --- |
| PR → `dev` | ✅ | — | — | — |
| PR → `main` | ✅ | ✅ 来源必须 `dev` | — | — |
| push `dev`（PR 合并后） | ✅ | — | ✅ 测试通过后执行 | — |
| push `main`（PR 合并后） | ✅ | — | — | ✅ 测试通过后执行 |

`test` 做三件事：`server` 安装依赖并跑冒烟测试（`npm run smoke`，131 项断言，全程本地临时库 + 随机端口，不碰线上）、`admin` 安装依赖并构建。

## 需要配置的 Secrets / Variables

部署凭据未配置时，部署 job 会**跳过并输出提示**，不会让流水线变红——所以可以先只跑测试，之后再补凭据。

### 测试环境（`dev`）

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `DEPLOY_SSH_KEY` | Secret | ✅ | 部署用私钥全文（含 `-----BEGIN ...-----`） |
| `DEPLOY_HOST` | Secret/Variable | ✅ | 服务器地址 |
| `DEPLOY_USER` | Secret/Variable | ✅ | SSH 用户名 |
| `DEPLOY_PORT` | Secret/Variable | ⬜ | 默认 `22` |
| `DEPLOY_PATH` | Secret/Variable | ⬜ | 部署目录，默认 `/opt/practice`（存放 `server/` 里的内容） |
| `DEPLOY_PM2_NAME` | Secret/Variable | ⬜ | pm2 进程名，默认 `practice` |
| `DEPLOY_URL` | Variable | ⬜ | 测试环境访问地址，显示在 Actions 的 deployment 链接上 |
| `DEPLOY_HEALTHCHECK_URL` | Variable | ⬜ | 部署后健康检查地址，如 `https://test.example.com/api/health` |

### 生产环境（`main`）

同上，但全部加 `PROD_` 前缀：`PROD_DEPLOY_SSH_KEY`、`PROD_DEPLOY_HOST`、`PROD_DEPLOY_USER`、`PROD_DEPLOY_PORT`、`PROD_DEPLOY_PATH`、`PROD_DEPLOY_PM2_NAME`、`PROD_DEPLOY_URL`、`PROD_DEPLOY_HEALTHCHECK_URL`。

`production` 环境建议在仓库 Settings → Environments 里加 **Required reviewers**，把「合并到 main」和「真正上线」拆成两步确认。

## 服务器准备

```bash
# 1) 生成专用部署密钥（不要用个人密钥）
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./deploy_key -N ""

# 2) 公钥写入服务器
ssh-copy-id -i ./deploy_key.pub deploy@your-server

# 3) 服务器上准备目录与运行时
sudo mkdir -p /opt/practice && sudo chown deploy:deploy /opt/practice
node -v          # 需要 >= 22.5.0（node:sqlite）
npm i -g pm2

# 4) 私钥内容粘贴到 DEPLOY_SSH_KEY
cat ./deploy_key
```

部署流程：备份 → `tar` 上传（**排除 `data/`、`node_modules`、`.env`**）→ `npm ci --omit=dev` → `pm2 restart` → 健康检查。

`data/` 被排除是有意的：远端 `data/app.db` 是真实业务库，不能被代码覆盖。

## 日常操作

```bash
# 开始一个改动
git switch dev && git pull
git switch -c feature/xxx
# ... 改代码 ...
git push -u origin feature/xxx
# 在 GitHub 上向 dev 提 PR → 等 test 绿 → 合并 → 自动部署测试环境

# 上线
# 在 GitHub 上向 main 提 PR（来源必须是 dev）→ 等 test + source-guard 绿 → 合并 → 自动部署生产
```

## 注意

- 部署 job 有 `concurrency` 锁，同一环境不会并发部署；新提交会**排队**而不是取消正在进行的部署。
- `test` 有 `concurrency.cancel-in-progress`，同分支的新提交会取消旧运行，省额度。
- 流水线只构建 `admin` 产物到 `server/public`（该目录不入库），再整体上传 `server/`。
- 如果改用 WorkBuddy「发布为应用」部署，把部署 job 换成 Webhook 调用即可，测试部分不用动。
