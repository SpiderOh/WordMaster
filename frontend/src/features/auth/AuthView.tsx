import { FormEvent, useState } from "react";

export function AuthView({ onLogin, error }: { onLogin: (username: string, password: string) => void; error: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); onLogin(username, password); };
  return <main className="app-shell"><section className="auth-view" aria-labelledby="login-title"><p className="eyebrow">WordMaster</p><h1 id="login-title">登录</h1><form className="settings-form" onSubmit={submit}><label>用户名<input aria-label="用户名" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>密码<input aria-label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action" type="submit">登录</button></form></section></main>;
}
