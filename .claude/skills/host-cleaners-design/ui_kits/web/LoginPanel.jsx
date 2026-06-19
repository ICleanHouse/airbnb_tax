// Session login screen — matches the product's /login.
const { useState: useStateLogin } = React;

function LoginPanel({ onSignedIn, onBack }) {
  const [email, setEmail] = useStateLogin("host@example.bg");
  const [pw, setPw] = useStateLogin("");
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a className="site-brand" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <img className="brand-mark" src="../../assets/mark.svg" width="34" height="34" alt="" />
          <span>Host Cleaners</span>
        </a>
        <div className="auth-heading">
          <h1>Log in</h1>
          <p>Use the email and password from your signup request.</p>
        </div>
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); onSignedIn(); }}>
          <label><span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label><span>Password</span>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </label>
          <button className="btn btn-primary btn-block" type="submit"><Icon name="log-in" /> Sign in</button>
          <div className="auth-divider"><span>OR</span></div>
          <button className="btn btn-secondary btn-block" type="button"><Icon name="user-plus" /> Create an account</button>
        </form>
      </section>
    </main>
  );
}

window.LoginPanel = LoginPanel;
