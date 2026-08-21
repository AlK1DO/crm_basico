import { NavLink } from 'react-router';

function Navbar() {
  return (
    <header className="navbar">
      <div className="container navbar-content">
        <h1 className="logo">Mi proyecto</h1>
        <nav>
          <NavLink to="/">Inicio</NavLink>
          <NavLink to="/nosotros">Nosotros</NavLink>
          <NavLink to="/servicios">Servicios</NavLink>
          <NavLink to="/contacto">Contacto</NavLink>
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
