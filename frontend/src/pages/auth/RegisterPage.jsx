import { useState } from 'react';
import API from '../../api';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import useAuth from '../../hooks/useAuth';

function RegisterPage() {
  const { register: authRegister } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });

  function handleSetRegisterField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
    setRegisterError('');
  }

  const [registerError, setRegisterError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  const handleEmailBlur = async () => {
    if (!formData.email) return;
    if (!/\S+@\S+\.\S+/.test(formData.email)) return;

    try {
      const res = await API.get('/auth/exists', { params: { email: formData.email } });
      if (res.data.exists) {        
        navigate('/login', { 
          state: { 
            redirectEmail: formData.email,
            redirectMessage: 'User already exists, please login.'
          } 
        });
      } else {
        setRegisterError('');
      }
    } catch (error) {
      console.error('Error checking email:', error);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.confirmPassword) {
      setRegisterError('Email and password are required');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setRegisterError('Passwords do not match');
      return;
    }

    try {
      await authRegister(formData.email, formData.password);
    } catch (error) {
      setRegisterError(error.response?.data?.message || 'Registration failed');
    }
  };

  return (<div className="d-flex flex-column w-100 vh-100 justify-content-center align-items-center">
    <h1 className="mb-4"><Link to={"/"} className='text-decoration-none text-dark'>ReplyPilot</Link></h1>
    <form onSubmit={handleRegister} className="w-100 d-flex flex-column justify-content-center align-items-center mb-5 card px-3 py-4 rounded-4" style={{ maxWidth: 400 }}>
      <h2>Register</h2>
      <input
        type="email"
        className="form-control my-2"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => {
          handleSetRegisterField('email', e.target.value);
        }}
        onBlur={handleEmailBlur}
      />
      <div className='input-group my-2'>
        <input
          type={showPassword ? "text" : "password"}
          className="form-control"
          placeholder="Password"
          value={formData.password}
          onChange={(e) => {
            handleSetRegisterField('password', e.target.value);
          }}
        />
        <button className="btn border" type="button" onClick={() => setShowPassword(!showPassword)}>
          <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
        </button>
      </div>
      <div className='input-group mt-2 mb-4'>
        <input
          type={showPassword ? "text" : "password"}
          className="form-control"
          placeholder="Confirm Password"
          value={formData.confirmPassword}
          onChange={(e) => {
            handleSetRegisterField('confirmPassword', e.target.value);
          }}
        />
        <button className="btn border" type="button" onClick={() => setShowPassword(!showPassword)}>
          <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
        </button>
      </div>
      

      <button type='submit' className="btn btn-primary w-100">Create Account</button>
      {registerError && <div className="text-danger align-self-start mt-2 ms-1">{registerError}</div>}

      <div className="align-self-start mt-3 ms-1">
        Already have an account? <Link className="text-decoration-none" to="/login">Login</Link>
      </div>
    </form>
  </div>);
}

export default RegisterPage;