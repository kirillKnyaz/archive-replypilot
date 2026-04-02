import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect } from 'react'
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

function UserMenu() {
  const { logout, user } = useAuth(); 
  const [ dropdownOpen, setDropdownOpen ] = React.useState(null);
  const menuRef = React.useRef(null);
  const menuToggleRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) && !menuToggleRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (<div>
    {user && !dropdownOpen && <span className='text-muted small me-2 d-none d-md-inline'>{user.email}</span>}
    <button ref={menuToggleRef} className='btn btn-outline-secondary rounded-circle p-2' onClick={() => setDropdownOpen(!dropdownOpen)}>
      <img src='/pfp.png' alt='Profile' style={{ width: '30px', height: '30px' }} />
    </button>
    {dropdownOpen && <div 
      ref={menuRef}
      className='position-absolute d-flex flex-column bg-white border rounded col-12 col-md-3 top-100 end-0 m-md-3 pt-3' 
      style={{ zIndex: 1000 }}
    >
      {user && <span className='text-muted small ps-4 mb-3'>: {user.email}</span>}
      <Link className='w-100 menu-link p-1 ps-4 m-0 text-decoration-none text-dark' to={"/"}>Dashboard</Link>
      <Link className='w-100 menu-link p-1 ps-4 m-0 text-decoration-none text-dark' to={"/billing"}>Billing</Link>

      <button className='btn btn-outline-danger m-3' type='button' onClick={() => logout('Logged out successfully')}>
        <span>Logout</span>
        <FontAwesomeIcon icon={faRightFromBracket} className='ms-2' />
      </button>
    </div>}
  </div>)
}

export default UserMenu