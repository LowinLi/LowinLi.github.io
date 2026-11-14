/** 站内链接一律走这里：部署到 GitHub Pages 的项目仓库时站点在 /<repo>/ 子路径下 */
export const url = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + path;
