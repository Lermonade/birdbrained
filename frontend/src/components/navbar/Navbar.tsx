import { NavLink, useLocation } from "react-router";
import styles from "./navbar.module.css";

import logo from "../../assets/birdbrained_logo.png";

export default function Navbar() {
  const { pathname } = useLocation();
  // "/" and "/dashboard" share the globe; the navbar floats over it on both
  const onDashboard = pathname === "/dashboard";
  // Every page sits on the look's dark sky, so the navbar always wears the look's ink;
  // on the dashboard it also gets a sky-coloured bar
  const className = [
    styles.navbar,
    styles.overGlobe,
    styles.onLanding,
    onDashboard ? styles.withBackground : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className={className}>
      <NavLink to="/" className={styles.logo}>
        {/* Painted in the text's colour: the logo's shape is a mask over currentColor */}
        <span
          role="img"
          aria-label="BirdBrained logo"
          className={styles.logoImage}
          style={{ maskImage: `url(${logo})`, WebkitMaskImage: `url(${logo})` }}
        />
        <span>BirdBrained</span>
      </NavLink>

      <div className={styles.navLinks}>
        <NavLink to="/" className={styles.navLink}>
          Home
        </NavLink>

        <NavLink to="/dashboard" className={styles.navLink}>
          Dashboard
        </NavLink>

        <NavLink to="/templates" className={styles.navLink}>
          Templates
        </NavLink>

        <NavLink to="/about" className={styles.navLink}>
          About
        </NavLink>
      </div>

      <NavLink to="/templates" className={styles.cta}>
        Try it out
      </NavLink>
    </nav>
  );
}
