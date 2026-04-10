/**
 * CP Arena — Data Store v2 (with testCases + auto-judge support)
 * Dual-mode: talks to Express backend when available, falls back to localStorage.
 */
const SCHEMA_VER = 'v2_testcases';
const DIFFICULTY_POINTS = { Easy: 10, Medium: 25, Hard: 50 };

/* ── API CONFIG ── */
const API = {
  BASE: 'http://localhost:3001/api',
  _token: null,

  getToken()      { return this._token || localStorage.getItem('cp_jwt'); },
  setToken(t)     { this._token = t; localStorage.setItem('cp_jwt', t); },
  clearToken()    { this._token = null; localStorage.removeItem('cp_jwt'); },

  async req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const tok = this.getToken();
    if (tok) opts.headers['Authorization'] = 'Bearer ' + tok;
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
      const r = await fetch(this.BASE + path, opts);
      return await r.json();
    } catch {
      return null; // backend offline → caller falls back to localStorage
    }
  },
  get(p)     { return this.req('GET',    p); },
  post(p, b) { return this.req('POST',   p, b); },
  put(p, b)  { return this.req('PUT',    p, b); },
  del(p)     { return this.req('DELETE', p); },
};

const Store = {
  K: {
    USERS: 'cp_users', PROBLEMS: 'cp_problems', SUBMISSIONS: 'cp_submissions',
    CURRENT_USER: 'cp_current_user', ADMIN_PASS: 'cp_admin_pass', SCHEMA: 'cp_schema_ver',
  },
  _get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  _set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  _del(k)    { localStorage.removeItem(k); },

  /* ── USERS ── */
  getUsers()          { return this._get(this.K.USERS) || []; },
  _saveUsers(u)       { this._set(this.K.USERS, u); },
  getUserById(id)     { return this.getUsers().find(u => u.id === id) || null; },
  getUserByName(name) { return this.getUsers().find(u => u.username.toLowerCase() === name.toLowerCase()) || null; },
  getUserByEmail(e)   { return this.getUsers().find(u => u.email.toLowerCase() === e.toLowerCase()) || null; },
  createUser({ username, email, password, role = 'student', cfHandle = '', lcHandle = '', gfgHandle = '' }) {
    const users = this.getUsers();
    const user = { id: 'u_' + Date.now() + Math.random().toString(36).substr(2,5), username, email, password, role, cfHandle, lcHandle, gfgHandle, createdAt: new Date().toISOString() };
    users.push(user); this._saveUsers(users); return user;
  },

  /* ── PROBLEMS ── */
  getProblems() {
    if (this._get(this.K.SCHEMA) !== SCHEMA_VER) {
      this._del(this.K.PROBLEMS);
      this._set(this.K.SCHEMA, SCHEMA_VER);
    }
    let p = this._get(this.K.PROBLEMS);
    if (!p || !p.length) { p = this._seedProblems(); this._set(this.K.PROBLEMS, p); }
    return p;
  },
  _saveProblems(p) { this._set(this.K.PROBLEMS, p); },
  getProblemById(id) { return this.getProblems().find(p => p.id === id) || null; },
  createProblem(data) {
    const problems = this.getProblems();
    const maxNum = problems.reduce((mx, p) => Math.max(mx, p.number || 0), 0);
    const problem = {
      id: 'p_' + Date.now() + Math.random().toString(36).substr(2,5),
      number: maxNum + 1, title: data.title,
      slug: data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      difficulty: data.difficulty, points: DIFFICULTY_POINTS[data.difficulty] || 10,
      tags: data.tags || [], description: data.description || '',
      constraints: data.constraints || '', examples: data.examples || [],
      testCases: data.testCases || [],
      timeLimit: data.timeLimit || '1 second', memoryLimit: data.memoryLimit || '256 MB',
      createdAt: new Date().toISOString(), createdBy: 'admin',
    };
    problems.push(problem); this._saveProblems(problems); return problem;
  },
  updateProblem(id, data) {
    const problems = this.getProblems();
    const i = problems.findIndex(p => p.id === id);
    if (i < 0) return null;
    problems[i] = { ...problems[i], ...data, id };
    if (data.difficulty) problems[i].points = DIFFICULTY_POINTS[data.difficulty] || problems[i].points;
    this._saveProblems(problems); return problems[i];
  },
  deleteProblem(id) { this._saveProblems(this.getProblems().filter(p => p.id !== id)); },

  /* ── SUBMISSIONS ── */
  getSubmissions()             { return this._get(this.K.SUBMISSIONS) || []; },
  _saveSubmissions(s)          { this._set(this.K.SUBMISSIONS, s); },
  getSubmissionsByUser(uid)    { return this.getSubmissions().filter(s => s.userId === uid); },
  getSubmissionsByProblem(pid) { return this.getSubmissions().filter(s => s.problemId === pid); },
  getPendingSubmissions()      { return this.getSubmissions().filter(s => s.verdict === 'pending'); },
  createSubmission({ userId, username, problemId, problemTitle, code, language, verdict = 'pending', score = 0, tcResults = null }) {
    const subs = this.getSubmissions();
    const sub = {
      id: 's_' + Date.now() + Math.random().toString(36).substr(2,5),
      userId, username, problemId, problemTitle, code, language,
      verdict, score, tcResults,
      submittedAt: new Date().toISOString(), reviewedAt: verdict !== 'pending' ? new Date().toISOString() : null,
    };
    subs.push(sub); this._saveSubmissions(subs); return sub;
  },
  setVerdict(id, verdict) {
    const subs = this.getSubmissions();
    const i = subs.findIndex(s => s.id === id);
    if (i < 0) return null;
    const problem = this.getProblemById(subs[i].problemId);
    subs[i].verdict = verdict; subs[i].reviewedAt = new Date().toISOString();
    subs[i].score = verdict === 'accepted' && problem ? problem.points : 0;
    this._saveSubmissions(subs); return subs[i];
  },

  /* ── CURRENT USER ── */
  getCurrentUser()     { return this._get(this.K.CURRENT_USER); },
  setCurrentUser(user) {
    this._set(this.K.CURRENT_USER, {
      id: user.id, username: user.username, email: user.email,
      role: user.role, avatar: user.avatar || ''
    });
  },
  clearCurrentUser()   { this._del(this.K.CURRENT_USER); },

  /* ── AVATAR (localStorage, no backend needed) ── */
  getAvatar(uid)         { return this._get('cp_avatar_' + uid) || ''; },
  setAvatar(uid, base64) { this._set('cp_avatar_' + uid, base64); },

  /* ── ADMIN ── */
  getAdminPassword() { return this._get(this.K.ADMIN_PASS) || 'admin123'; },

  /* ── LEADERBOARD ── */
  getLeaderboard() {
    const users = this.getUsers().filter(u => u.role !== 'admin');
    const map = {};
    users.forEach(u => { map[u.id] = { userId: u.id, username: u.username, solved: 0, score: 0, lastAccepted: null, _s: new Set() }; });
    this.getSubmissions().filter(s => s.verdict === 'accepted')
      .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
      .forEach(s => {
        if (!map[s.userId]) map[s.userId] = { userId: s.userId, username: s.username, solved: 0, score: 0, lastAccepted: null, _s: new Set() };
        const e = map[s.userId];
        if (!e._s.has(s.problemId)) { e._s.add(s.problemId); e.solved++; e.score += s.score; e.lastAccepted = s.submittedAt; }
      });
    return Object.values(map).map(({ _s, ...r }) => r)
      .sort((a, b) => b.score - a.score || b.solved - a.solved || (a.lastAccepted && b.lastAccepted ? new Date(a.lastAccepted) - new Date(b.lastAccepted) : 0));
  },

  getProblemStats(pid) {
    const all = this.getSubmissions().filter(s => s.problemId === pid);
    const acc = all.filter(s => s.verdict === 'accepted');
    return { total: all.length, accepted: acc.length, solvers: new Set(acc.map(s => s.userId)).size, rate: all.length ? Math.round(acc.length / all.length * 100) : 0 };
  },

  getSolvedByUser(uid) {
    const s = new Set();
    this.getSubmissions().filter(s => s.userId === uid && s.verdict === 'accepted').forEach(sub => s.add(sub.problemId));
    return s;
  },

  getUserStats(uid) {
    const subs = this.getSubmissionsByUser(uid);
    const solved = this.getSolvedByUser(uid);
    const lb = this.getLeaderboard();
    const rank = lb.findIndex(e => e.userId === uid) + 1;
    const entry = lb.find(e => e.userId === uid);
    const problems = this.getProblems();
    const solvedProblems = problems.filter(p => solved.has(p.id));
    const easyTotal = problems.filter(p => p.difficulty === 'Easy').length;
    const medTotal = problems.filter(p => p.difficulty === 'Medium').length;
    const hardTotal = problems.filter(p => p.difficulty === 'Hard').length;
    const easySolved = solvedProblems.filter(p => p.difficulty === 'Easy').length;
    const medSolved = solvedProblems.filter(p => p.difficulty === 'Medium').length;
    const hardSolved = solvedProblems.filter(p => p.difficulty === 'Hard').length;
    const acc = subs.filter(s => s.verdict === 'accepted').length;
    return {
      rank: rank || lb.length + 1, score: entry?.score || 0,
      totalSolved: solved.size, totalSubs: subs.length,
      acceptRate: subs.length ? Math.round(acc / subs.length * 100) : 0,
      easySolved, medSolved, hardSolved, easyTotal, medTotal, hardTotal,
      solvedProblems, recentSubs: subs.sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 20),
    };
  },

  /* ── EXTERNAL & HEATMAP ── */
  updateExternalHandles(uid, handles) {
    const users = this.getUsers();
    const i = users.findIndex(u => u.id === uid);
    if (i > -1) {
      users[i] = { ...users[i], ...handles };
      this._saveUsers(users);
      // update current user if needed
      const current = this.getCurrentUser();
      if (current && current.id === uid) {
        this.setCurrentUser(users[i]);
      }
    }
  },

  getHeatmapData(uid) {
    // Generate pseudo-random heatmap data representing last 365 days
    // incorporating local submissions and fake external ones.
    const user = this.getUserById(uid);
    const subs = this.getSubmissionsByUser(uid);
    
    // Hash-based seeded random so it's consistent for the user
    let seed = 0;
    for(let i=0; i<user.username.length; i++) seed += user.username.charCodeAt(i);
    const random = () => { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

    const today = new Date();
    today.setHours(0,0,0,0);
    const heatmap = [];
    const multiplier = (user.cfHandle ? 1 : 0) + (user.lcHandle ? 1 : 0) + (user.gfgHandle ? 1 : 0);
    
    // Add real local submissions to a map
    const localSubsCount = {};
    subs.forEach(s => {
      const d = new Date(s.submittedAt);
      const str = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      localSubsCount[str] = (localSubsCount[str] || 0) + 1;
    });

    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const str = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      
      let count = localSubsCount[str] || 0;
      let platform = 'local';
      
      // Add fake external activity if handles are linked
      if (multiplier > 0) {
        if (random() > 0.6) {
          count += Math.floor(random() * 3 * multiplier);
          const r = random();
          if (user.lcHandle && r < 0.33) platform = 'lc';
          else if (user.cfHandle && r < 0.66) platform = 'cf';
          else if (user.gfgHandle) platform = 'gfg';
        }
      }
      
      heatmap.push({ date: str, count, platform });
    }
    return heatmap;
  },

  /* ── SEED DATA ── */
  _seedProblems() {
    return [
      {
        id:'p_s001', number:1, title:'Two Sum', slug:'two-sum', difficulty:'Easy', points:10,
        tags:['Array','Hash Table'],
        description:`## Problem Statement\n\nGiven an array of integers \`nums\` and an integer \`target\`, return **indices of the two numbers** such that they add up to \`target\`.\n\nYou may assume exactly one solution exists. Return indices in **ascending order**.\n\n## Input Format\n- Line 1: \`n\` — size of the array\n- Line 2: \`n\` space-separated integers\n- Line 3: \`target\`\n\n## Output Format\nTwo space-separated 0-indexed integers \`i j\` (i < j).`,
        constraints:`- \`2 <= n <= 10^4\`\n- \`-10^9 <= nums[i] <= 10^9\`\n- Exactly one valid answer exists.`,
        examples:[
          {input:'4\n2 7 11 15\n9', output:'0 1', explanation:'nums[0]+nums[1]=9'},
          {input:'3\n3 2 4\n6',     output:'1 2', explanation:'nums[1]+nums[2]=6'},
        ],
        testCases:[
          {input:'4\n2 7 11 15\n9', expectedOutput:'0 1', isHidden:false},
          {input:'3\n3 2 4\n6',     expectedOutput:'1 2', isHidden:false},
          {input:'2\n3 3\n6',       expectedOutput:'0 1', isHidden:true},
          {input:'4\n-3 4 3 90\n0', expectedOutput:'0 2', isHidden:true},
        ],
        timeLimit:'1 second', memoryLimit:'256 MB', createdAt:new Date().toISOString(), createdBy:'admin',
      },
      {
        id:'p_s002', number:2, title:'Valid Parentheses', slug:'valid-parentheses', difficulty:'Easy', points:10,
        tags:['Stack','String'],
        description:`## Problem Statement\n\nGiven a string \`s\` containing only \`'(', ')', '{', '}', '[', ']'\`, determine if the input string is **valid**.\n\nAn input string is valid if open brackets are closed by the same type in the correct order.\n\n## Input Format\n- Line 1: the string \`s\`\n\n## Output Format\nPrint \`true\` or \`false\`.`,
        constraints:`- \`1 <= s.length <= 10^4\`\n- \`s\` consists of parentheses only.`,
        examples:[
          {input:'()',     output:'true'},
          {input:'()[]{} ', output:'true'},
          {input:'(]',     output:'false'},
        ],
        testCases:[
          {input:'()',       expectedOutput:'true',  isHidden:false},
          {input:'()[]{}',   expectedOutput:'true',  isHidden:false},
          {input:'(]',       expectedOutput:'false', isHidden:false},
          {input:'([)]',     expectedOutput:'false', isHidden:true},
          {input:'{[]}',     expectedOutput:'true',  isHidden:true},
          {input:'',         expectedOutput:'true',  isHidden:true},
        ],
        timeLimit:'1 second', memoryLimit:'256 MB', createdAt:new Date().toISOString(), createdBy:'admin',
      },
      {
        id:'p_s003', number:3, title:'Longest Substring Without Repeating Characters', slug:'longest-substring', difficulty:'Medium', points:25,
        tags:['Hash Table','String','Sliding Window'],
        description:`## Problem Statement\n\nGiven a string \`s\`, find the length of the **longest substring** without repeating characters.\n\n## Input Format\n- Line 1: the string \`s\`\n\n## Output Format\nA single integer — the length of the longest such substring.`,
        constraints:`- \`0 <= s.length <= 5*10^4\`\n- \`s\` consists of English letters, digits, symbols and spaces.`,
        examples:[
          {input:'abcabcbb', output:'3', explanation:'"abc" has length 3.'},
          {input:'bbbbb',    output:'1'},
          {input:'pwwkew',   output:'3'},
        ],
        testCases:[
          {input:'abcabcbb', expectedOutput:'3', isHidden:false},
          {input:'bbbbb',    expectedOutput:'1', isHidden:false},
          {input:'pwwkew',   expectedOutput:'3', isHidden:true},
          {input:'dvdf',     expectedOutput:'3', isHidden:true},
          {input:'',         expectedOutput:'0', isHidden:true},
        ],
        timeLimit:'1 second', memoryLimit:'256 MB', createdAt:new Date().toISOString(), createdBy:'admin',
      },
      {
        id:'p_s004', number:4, title:'Binary Search', slug:'binary-search', difficulty:'Easy', points:10,
        tags:['Array','Binary Search'],
        description:`## Problem Statement\n\nGiven a sorted ascending array \`nums\` and \`target\`, return the index of \`target\` or \`-1\` if not found.\n\nUse **O(log n)** time complexity.\n\n## Input Format\n- Line 1: \`n\`\n- Line 2: \`n\` sorted space-separated integers\n- Line 3: \`target\`\n\n## Output Format\nThe 0-indexed position, or \`-1\`.`,
        constraints:`- \`1 <= n <= 10^4\`\n- All integers are unique, sorted ascending.`,
        examples:[
          {input:'6\n-1 0 3 5 9 12\n9',  output:'4'},
          {input:'6\n-1 0 3 5 9 12\n2',  output:'-1'},
        ],
        testCases:[
          {input:'6\n-1 0 3 5 9 12\n9',  expectedOutput:'4',  isHidden:false},
          {input:'6\n-1 0 3 5 9 12\n2',  expectedOutput:'-1', isHidden:false},
          {input:'1\n5\n5',              expectedOutput:'0',  isHidden:true},
          {input:'3\n1 3 5\n6',          expectedOutput:'-1', isHidden:true},
        ],
        timeLimit:'1 second', memoryLimit:'256 MB', createdAt:new Date().toISOString(), createdBy:'admin',
      },
      {
        id:'p_s005', number:5, title:'Climbing Stairs', slug:'climbing-stairs', difficulty:'Easy', points:10,
        tags:['Dynamic Programming','Math'],
        description:`## Problem Statement\n\nYou are climbing a staircase. It takes \`n\` steps to reach the top. Each time you can climb **1 or 2** steps. How many distinct ways can you climb to the top?\n\n## Input Format\n- Line 1: \`n\`\n\n## Output Format\nA single integer — the number of distinct ways.`,
        constraints:`- \`1 <= n <= 45\``,
        examples:[
          {input:'2', output:'2', explanation:'(1+1) or (2)'},
          {input:'3', output:'3', explanation:'(1+1+1), (1+2), (2+1)'},
        ],
        testCases:[
          {input:'2',  expectedOutput:'2',  isHidden:false},
          {input:'3',  expectedOutput:'3',  isHidden:false},
          {input:'5',  expectedOutput:'8',  isHidden:true},
          {input:'10', expectedOutput:'89', isHidden:true},
          {input:'1',  expectedOutput:'1',  isHidden:true},
        ],
        timeLimit:'1 second', memoryLimit:'256 MB', createdAt:new Date().toISOString(), createdBy:'admin',
      },
      {
        id:'p_s006', number:6, title:'Maximum Subarray', slug:'maximum-subarray', difficulty:'Medium', points:25,
        tags:['Array','Dynamic Programming','Divide and Conquer'],
        description:`## Problem Statement\n\nGiven an integer array \`nums\`, find the **subarray with the largest sum**, and return its sum.\n\n## Input Format\n- Line 1: \`n\`\n- Line 2: \`n\` space-separated integers\n\n## Output Format\nA single integer — the maximum subarray sum.`,
        constraints:`- \`1 <= n <= 10^5\`\n- \`-10^4 <= nums[i] <= 10^4\``,
        examples:[
          {input:'9\n-2 1 -3 4 -1 2 1 -5 4', output:'6', explanation:'[4,-1,2,1] has sum 6.'},
          {input:'1\n1',                       output:'1'},
        ],
        testCases:[
          {input:'9\n-2 1 -3 4 -1 2 1 -5 4', expectedOutput:'6',  isHidden:false},
          {input:'1\n1',                       expectedOutput:'1',  isHidden:false},
          {input:'5\n5 4 -1 7 8',              expectedOutput:'23', isHidden:true},
          {input:'4\n-1 -2 -3 -4',             expectedOutput:'-1', isHidden:true},
        ],
        timeLimit:'1 second', memoryLimit:'256 MB', createdAt:new Date().toISOString(), createdBy:'admin',
      },
      {
        id:'p_s007', number:7, title:'Merge K Sorted Lists', slug:'merge-k-sorted-lists', difficulty:'Hard', points:50,
        tags:['Linked List','Heap','Divide and Conquer'],
        description:`## Problem Statement\n\nYou are given \`k\` sorted arrays. Merge all into one sorted array and print it.\n\n## Input Format\n- Line 1: \`k\` — number of arrays\n- Next \`k\` lines: space-separated integers for each sorted array (empty line = empty array)\n\n## Output Format\nAll merged integers space-separated on one line. If all empty, print nothing.`,
        constraints:`- \`0 <= k <= 10^4\`\n- Total elements <= 10^4`,
        examples:[
          {input:'3\n1 4 5\n1 3 4\n2 6', output:'1 1 2 3 4 4 5 6'},
          {input:'0',                    output:''},
        ],
        testCases:[
          {input:'3\n1 4 5\n1 3 4\n2 6', expectedOutput:'1 1 2 3 4 4 5 6', isHidden:false},
          {input:'0',                    expectedOutput:'',               isHidden:false},
          {input:'2\n1 3\n2 4',          expectedOutput:'1 2 3 4',       isHidden:true},
          {input:'1\n5',                 expectedOutput:'5',              isHidden:true},
        ],
        timeLimit:'2 seconds', memoryLimit:'256 MB', createdAt:new Date().toISOString(), createdBy:'admin',
      },
    ];
  },
};
