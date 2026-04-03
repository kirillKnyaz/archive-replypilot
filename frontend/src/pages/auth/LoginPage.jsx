import { useEffect, useState } from 'react';
import API from '../../api';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';


function LoginPage() {
  const location = useLocation();
  const state = location.state || {};
  const [loggedOutMessage, setLoggedOutMessage] = useState('');

  const [email, setEmail] = useState(state.redirectEmail || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const { login } = useAuth();

  // Always update loggedOutMessage when location.state.logoutMessage changes
  useEffect(() => {
    if (state.logoutMessage) {
      setLoggedOutMessage(state.logoutMessage);
    }
  }, [location]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setLoginMessage('Email and password are required');
      return;
    }
    setLoading(true);

    await login(email, password, setLoginMessage, setLoading);
    setLoginMessage(''); // Clear message on successful login
  };

  return (<div className="d-flex flex-column w-100 vh-100 justify-content-center align-items-center">
    {loggedOutMessage && <div className="text-success mb-3">{loggedOutMessage}</div>}
    <h1 className="mb-4"><Link to={"/"} className='text-decoration-none text-dark'>ReplyPilot</Link></h1>
    <form onSubmit={(e) => handleLogin(e)} className="w-100 d-flex flex-column justify-content-center align-items-center mb-5 card px-3 py-4 rounded-4" style={{ maxWidth: 400 }}>
      <h2>Login</h2>
      <input
        type="email"
        className="form-control my-2"
        placeholder="Email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setLoginMessage(''); // Clear message on input change
        }}
      />
      <div className='input-group my-2'>
        <input
          type={showPassword ? "text" : "password"}
          className="form-control"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn border" type="button" onClick={() => setShowPassword(!showPassword)}>
          <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
        </button>
      </div>


      <button type='submit' className="btn btn-primary w-100">Login</button>
      {loginMessage && <div className="text-danger mt-2 ms-1 align-self-start">{loginMessage}</div>}
      {loading && <div className="spinner-border mt-2 ms-1 align-self-start"></div>}
      <div className="align-self-start mt-3">
        Don't have an account? <Link className="text-decoration-none" to="/register">Register</Link>
      </div>
    </form>
  </div>);
}

export default LoginPage;