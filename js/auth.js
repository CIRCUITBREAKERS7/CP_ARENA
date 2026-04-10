/**
 * CP Arena — Auth Module
 * Determines admin by username === 'admin' (role-agnostic, stale-data safe)
 */

const Auth = {
  /** Returns true if this user object is the admin */
  _isAdmin(user) {
    return user && (user.username === 'admin' || user.role === 'admin');
  },

  /** Ensure the admin user always has role='admin' fixed in localStorage */
  _fixAdminRole() {
    const users = Store.getUsers();
    let changed = false;
    users.forEach((u, i) => {
      if (u.username === 'admin' && u.role !== 'admin') {
        users[i].role = 'admin';
        changed = true;
      }
    });
    if (changed) Store._saveUsers(users);

    // Fix current session too
    const cur = Store.getCurrentUser();
    if (cur && cur.username === 'admin' && cur.role !== 'admin') {
      const fixed = { ...cur, role: 'admin' };
      Store._set(Store.K.CURRENT_USER, fixed);
    }
  },

  login(usernameOrEmail, password) {
    this._fixAdminRole(); // Repair before login
    let user = Store.getUserByName(usernameOrEmail) || Store.getUserByEmail(usernameOrEmail);
    if (!user || user.password !== password) return { ok: false, error: 'Invalid username or password.' };
    // Always correct the role before saving session
    if (user.username === 'admin') user.role = 'admin';
    Store.setCurrentUser(user);
    return { ok: true, user };
  },

  register(username, email, password, role = 'student', adminId = '') {
    if (!username || username.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
    if (!email || !email.includes('@')) return { ok: false, error: 'Enter a valid email address.' };
    if (!password || password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    if (Store.getUserByName(username)) return { ok: false, error: 'Username is already taken.' };
    if (Store.getUserByEmail(email)) return { ok: false, error: 'Email is already registered.' };
    const user = Store.createUser({ username, email, password, role });
    Store.setCurrentUser(user);
    return { ok: true, user };
  },

  logout() {
    Store.clearCurrentUser();
    const inAdmin = window.location.pathname.includes('/admin/');
    window.location.href = inAdmin ? '../index.html' : 'index.html';
  },

  requireLogin() {
    const user = Store.getCurrentUser();
    if (!user) {
      const inAdmin = window.location.pathname.includes('/admin/');
      window.location.href = inAdmin ? '../index.html' : 'index.html';
      return null;
    }
    return user;
  },

  requireAdmin() {
    const user = Store.getCurrentUser();
    if (!user || !this._isAdmin(user)) {
      const inAdmin = window.location.pathname.includes('/admin/');
      window.location.href = inAdmin ? '../index.html' : 'index.html';
      return null;
    }
    return user;
  },

  get() { return Store.getCurrentUser(); },
};
