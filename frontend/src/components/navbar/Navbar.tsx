import { NavLink, useLocation } from "react-router";
import styles from "./navbar.module.css";

import logo from "../../assets/birdbrained_logo.png";

export default function Navbar() {
  const { pathname } = useLocation();
  // "/" and "/dashboard" share the globe; the navbar floats over it on both
  const onLanding = pathname === "/";
  const onDashboard = pathname === "/dashboard";

  const className = [
    styles.navbar,
    onLanding || onDashboard ? styles.overGlobe : "",
    onLanding ? styles.onLanding : "",
    onDashboard ? styles.withBackground : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className={className}>
      <NavLink to="/" className={styles.logo}>
        <img
          src={logo}
          alt="BirdBrained logo"
          className={styles.logoImage}
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
