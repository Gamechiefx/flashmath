# FlashMath Dev Tools

Comprehensive development toolkit for FlashMath Arena with component playground and mock match simulation.

## 🛠️ Features

### ✅ Environment-Gated Security
- **Development Only**: Dev tools only enabled in `docker-compose.dev.yml`
- **Production Safe**: Completely disabled in production via environment variables
- **Server-Side Guards**: Routes blocked with redirects if not enabled

### ✅ Component Playground (`/dev/teams`)
- **7 Organized Tabs** covering the entire match lifecycle:
  - **Mode Selection**: Team mode entry modals and quick actions
  - **Role Voting**: IGL voting panels and strategy timers
  - **Queue & Formation**: Team formation progress and queue status
  - **Scouting**: Enemy team intel and comparison dashboards
  - **Active Match**: Live progress bars, handoff countdowns, IGL controls
  - **Match Phases**: Halftime panels, tactical breaks, phase controls
  - **Post-Match**: Round charts, summary cards, final results
- **Interactive Controls**: Click buttons, vote for players, trigger countdowns
- **State Management**: Reset state button and persistent component states
- **Direct Launch**: "Launch Mock Match" button to jump to demo mode

### ✅ Mock Match Simulation (`/arena/teams/match/demo?demo=true`)
- **Full Match Flow**: Complete 5v5 match simulation without Socket.io
- **Realistic Data**: Generated teams, players, questions, and scoring
- **Phase Jumping**: Skip directly to any match phase for testing
- **Demo Control Panel**: Top banner with phase controls and navigation
- **All Components**: Every arena component works with mock data

### ✅ Mock Match State Generator (`src/lib/arena/mock-match-state.ts`)
- **MockMatchSimulator Class**: Simulates complete match flow
- **Realistic Teams**: Generated with proper names, ELO, roles
- **Question Bank**: 200+ generated math questions across all operations
- **Phase Transitions**: Proper progression through all match phases
- **Time Simulation**: Realistic timers and countdowns
- **Statistics**: Halftime stats, final results, player performance

## 🚀 Usage

### Development Environment

```bash
# Start development environment with dev tools
docker-compose -f docker-compose.dev.yml up

# Or locally
npm run dev
```

### Access Points

| Tool | URL | Description |
|------|-----|-------------|
| **Component Playground** | `/dev/teams` | Interactive showcase of all arena components |
| **Mock Match** | `/arena/teams/match/demo?demo=true` | Full match simulation with controls |

### Component Playground Navigation

1. **Browse Components**: Use the 7 tabs to explore different match phases
2. **Interact**: Click buttons, vote for players, test all interactions
3. **Reset State**: Use "Reset State" button to clear component states
4. **Launch Match**: Click "Launch Mock Match" to jump to full simulation

### Mock Match Controls

1. **Phase Jumping**: Use the demo control panel to skip to any phase
2. **Component Testing**: All arena components work with realistic mock data
3. **Return to Playground**: Click "← Component Playground" to go back

## 🔒 Security

### Production Safety
- **Environment Variables**: `ENABLE_DEV_TOOLS` and `NEXT_PUBLIC_ENABLE_DEV_TOOLS` only in dev
- **Route Guards**: Server-side checks redirect to home if not enabled
- **Zero Impact**: No dev code runs in production builds

### Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| `/dev/teams` playground | ✅ Available | ❌ Redirect to / |
| `?demo=true` mock match | ✅ Available | ❌ Ignored |
| Socket.io connections | ✅ Optional (bypassed in demo) | ✅ Required |
| Real match data | ✅ or mock data | ✅ Only source |

## 🏗️ Architecture

### File Structure
```
src/
├── app/dev/
│   ├── layout.tsx          # Dev-only layout with guards
│   └── teams/page.tsx      # Component playground
├── lib/arena/
│   └── mock-match-state.ts # Mock match simulator
└── app/arena/teams/match/[matchId]/
    └── team-match-client.tsx # Enhanced with demo mode
```

### Environment Variables
```bash
# Development only (docker-compose.dev.yml)
ENABLE_DEV_TOOLS=true
NEXT_PUBLIC_ENABLE_DEV_TOOLS=true

# Production (docker-compose.yml)
# No dev tools variables = disabled
```

## 🎯 Use Cases

### Component Development
- **Isolated Testing**: Test individual components without full match setup
- **Visual Debugging**: See all component states and interactions
- **Rapid Iteration**: Quickly test changes across all match phases

### Match Flow Testing
- **End-to-End**: Test complete match flow without real players
- **Phase-Specific**: Jump directly to problematic phases
- **Edge Cases**: Test timeout scenarios, halftime, post-match flows

### UI/UX Validation
- **Design Review**: Showcase all components to stakeholders
- **User Testing**: Let users interact with components safely
- **Documentation**: Visual reference for all arena components

## 🔧 Development

### Adding New Components
1. Add component to appropriate tab in `/dev/teams/page.tsx`
2. Ensure component works with mock data
3. Test in both playground and mock match modes

### Extending Mock Data
1. Modify `MockMatchSimulator` in `mock-match-state.ts`
2. Add new question types, team configurations, or match scenarios
3. Update conversion logic in `team-match-client.tsx` if needed

### Security Considerations
- Always check `ENABLE_DEV_TOOLS` environment variable
- Use server-side guards for route protection
- Never expose dev tools in production builds

## 📊 Benefits

- **Faster Development**: No need to set up full matches for component testing
- **Better Testing**: Comprehensive coverage of all match scenarios
- **Improved Documentation**: Visual showcase of all components
- **Safer Debugging**: Isolated environment for testing changes
- **Enhanced Collaboration**: Easy way to show components to team members

---

**Note**: Dev tools are completely disabled in production and have zero impact on performance or security.