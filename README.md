# FlashMath ⚡

> **Master Math at the Speed of Light.**

FlashMath is a futuristic, high-velocity arithmetic training platform designed to make mental math addictive. Transporting users into a cyberpunk universe, it combines rigorous drill practice with RPG-like progression, competitive leagues, and deep customization.

![Dashboard Preview](./dashboard-preview.png) *Add a screenshot of your dashboard here*

## 🚀 Key Features

### 🎮 Gamified Training
- **Speed Drills**: Race against the clock in Addition, Subtraction, Multiplication, and Division.
- **Adaptive Difficulty**: Progression system that adapts to your skill level (Tiers I - IV).
- **Instant Feedback**: Visual and auditory cues for correct/incorrect answers to reinforce learning.

### 🏆 Competitive Leagues
- **Weekly Leaderboards**: Compete against other "Pilots" in a 5-tier league system (Neon -> Cobalt -> Plasma -> Void -> Apex).
- **Promotion & Relegation**: Fight to stay in the promotion zone or risk falling back.
- **Ghost Data**: Simulate a living world with intelligent bot activity.

### 🛍️ The Shop & Locker
- **Global Shop**: Spend your hard-earned **Flux Coins (§)** on exclusive cosmetic upgrades.
- **Cyberpunk Aesthetics**:
  - **Themes**: Switch your UI between *Dark Mode*, *Synthwave*, *Matrix*, *Deep Space*, and more.
  - **Particles**: Unlock explosive visual effects like *Math Boom*, *Glitch*, and *Vortex*.
  - **Audio Packs**: Change the soundscape with *8-Bit*, *Typewriter*, or *Futuristic* SFX.
- **Inventory System**: Manage and equip your loadout in the Locker.

### 📊 Advanced Analytics
- **Career Stats**: Track your lifetime accuracy, total XP, and speed.
- **Trend Analysis**: Visualize your improvement over time with dynamic charts.
- **Weakest Link**: Automatically identifies operations that need more practice.

## 🛠️ Tech Stack

Built with a modern, performance-first stack:

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Database**: [SQLite](https://www.sqlite.org/) (Local file-based `flashmath.db` for zero-latency).
- **Authentication**: Custom Session/NextAuth implementation.

## ⚡ Getting Started

1. **Clone the repository**
   ```bash
   git clone https://gitcode.lanit.services/e.hill/FlashMath.git
   cd FlashMath
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Initialize Database**
   The app uses a local SQLite database. It will be automatically seeded on the first run, or you can run:
   ```bash
   npm run seed
   ```

4. **Run the Development Server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000) to start your training.

## 🛡️ Admin & Security

- Access the hidden Admin Dashboard at `/admin` (Restricted to specific User IDs).
- Manage users, ban accounts, and inspect server-side stats.

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

*Built with ⚡ by the FlashMath Team*
