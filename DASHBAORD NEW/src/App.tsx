import Header from './components/Header';
import ProfileSection from './components/ProfileSection';
import MetricsCards from './components/MetricsCards';
import XPTrendChart from './components/XPTrendChart';
import LeadStatusChart from './components/LeadStatusChart';
import Leaderboard from './components/Leaderboard';
import QuickActions from './components/QuickActions';
import Achievements from './components/Achievements';
import ActivityFeed from './components/ActivityFeed';
import TasksList from './components/TasksList';
import TargetsVsAchievements from './components/TargetsVsAchievements';
import {
  officerData,
  performanceMetrics,
  xpTrendData,
  leadStatusData,
  leaderboardData,
  recentActivities,
  upcomingTasks,
  badges,
} from './data/mockData';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />

      <main className="max-w-[1800px] mx-auto px-6 py-8">
        <div className="mb-8">
          <ProfileSection officer={officerData} />
        </div>

        <div className="mb-8">
          <MetricsCards metrics={performanceMetrics} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <XPTrendChart data={xpTrendData} />
          </div>
          <div>
            <Achievements badges={badges} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <LeadStatusChart data={leadStatusData} />
          </div>
          <div>
            <QuickActions />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <Leaderboard data={leaderboardData} currentUserId="3" />
          </div>
          <div>
            <TargetsVsAchievements />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ActivityFeed activities={recentActivities} />
          <TasksList tasks={upcomingTasks} />
        </div>
      </main>
    </div>
  );
}

export default App;
