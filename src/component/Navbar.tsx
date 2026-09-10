import { NavLink, Link } from 'react-router';
import { useAuth } from '../hooks/useAuth';

const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'nav-link active' : 'nav-link';

function Navbar() {
  const { user } = useAuth();

  return (
    <header className="navbar">
      <div className="container navbar-content">
        <h1 className="logo">PharmaCRM</h1>
        <nav className="nav-links">
          <NavLink to="/inicio" end className={navClass}>Inicio</NavLink>
          <NavLink to="/nosotros" className={navClass}>Nosotros</NavLink>
          <NavLink to="/servicios" className={navClass}>Servicios</NavLink>
          <NavLink to="/contacto" className={navClass}>Contacto</NavLink>
        </nav>
        <div className="navbar-actions">
          <Link to={user ? '/dashboard' : '/login'} className="btn-nav">
            {user ? 'Dashboard' : 'Iniciar sesión'}
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
