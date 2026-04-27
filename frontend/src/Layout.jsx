import { Link, Outlet } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import { useEffect, useState } from 'react';
import UserMenu from './components/dashboard/UserMenu';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import API from './api';
gsap.registerPlugin(MotionPathPlugin);

function Layout() {
  const { user, authenticated, loading, logout } = useAuth();
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    if (!authenticated) return;
    API.get('/leads/action-queue')
      .then(({ data }) => setQueueCount(data.total))
      .catch(() => {});
  }, [authenticated]);

  useEffect(() => {
    const icon = document.querySelector('.plane-icon');
    const hoverTrigger = document.querySelector('.navbar-brand');
    if (!icon) return;

    gsap.set(icon, { x: 0, y: 0 });

    let tween;

    const onHover = () => {
      if (tween) tween.kill();

      tween = gsap.to(icon, {
        duration: 1.5,
        motionPath: {
          path: [
            { x: 0, y: 0 },
            { x: 9, y: -9 },   
            { x: 27, y: 9 },   
            { x: 15, y: 27 },
            { x: 36, y: -9 }       
          ],
          curviness: 1.7,
          autoRotate: false,
        },
        ease: "power1.inOut"
      });
    };

    const onLeave = () => {
      if (tween) {
        tween.kill();
        tween = null;
      }

      gsap.set(icon, { x: 0, y: 0 });
    };

    hoverTrigger.addEventListener('mouseenter', onHover);
    hoverTrigger.addEventListener('mouseleave', onLeave);

    return () => {
      hoverTrigger.removeEventListener('mouseenter', onHover);
      hoverTrigger.removeEventListener('mouseleave', onLeave);
    };
  }, []);


  return (<div className="d-flex flex-column vh-100">
    <nav className="navbar navbar-expand-lg navbar-light position-relative border-bottom">
      <div className="container-fluid">
        <Link to={"/"} className="navbar-brand fs-3">
          <span className='me-2'>ReplyPilot</span>
          <span className="plane-wrapper position-relative">
            <FontAwesomeIcon icon={faPaperPlane} style={{ color: "green" }} className="plane-icon position-absolute" />
          </span>
        </Link>

        {authenticated ? (
          <div className="d-flex align-items-center gap-2">
            <Link to="/queue" className="position-relative btn btn-sm btn-outline-secondary">
              Queue
              {queueCount > 0 && (
                <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                  style={{ fontSize: '0.6rem' }}>
                  {queueCount}
                </span>
              )}
            </Link>
            <UserMenu />
          </div>
        ) : (
          <Link to="/login" className="btn btn-primary">Login</Link>
        )}
      </div>
    </nav>

    <div className="container-fluid m-0 p-0 flex-grow-1">
      <Outlet />
    </div>

    <footer className="bg-light text-center text-lg-start mt-auto">
      <div className="text-center p-3">
        © 2025 ReplyPilot
      </div>
    </footer>
  </div>);
}

export default Layout;