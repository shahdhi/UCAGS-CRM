import {
  Officer,
  LeadStatus,
  Activity,
  Task,
  LeaderboardEntry,
  PerformanceMetrics,
  XPDataPoint,
} from '../types';

export const officerData: Officer = {
  id: '1',
  name: 'Sarah Johnson',
  designation: 'Senior Admission Officer',
  email: 'sarah.johnson@college.edu',
  phone: '+1 (555) 123-4567',
  avatar: 'SJ',
  currentXP: 8750,
  currentLevel: 12,
  xpToNextLevel: 10000,
  rank: 3,
  totalOfficers: 45,
  rankChange: 2,
};

export const performanceMetrics: PerformanceMetrics = {
  enrollments: 42,
  enrollmentsTrend: 12.5,
  conversionRate: 34.2,
  conversionTrend: 5.3,
  pendingFollowups: 18,
  activeLeads: 127,
  revenue: 285000,
  revenueTrend: 18.7,
  avgResponseTime: 2.4,
};

export const xpTrendData: XPDataPoint[] = [
  { month: 'Oct', xp: 6200 },
  { month: 'Nov', xp: 6800 },
  { month: 'Dec', xp: 7500 },
  { month: 'Jan', xp: 7200 },
  { month: 'Feb', xp: 8100 },
  { month: 'Mar', xp: 8750 },
];

export const leadStatusData: LeadStatus[] = [
  { status: 'New', count: 32, percentage: 25.2, color: '#3B82F6' },
  { status: 'Contacted', count: 28, percentage: 22.0, color: '#8B5CF6' },
  { status: 'Interested', count: 24, percentage: 18.9, color: '#10B981' },
  { status: 'Enrolled', count: 18, percentage: 14.2, color: '#059669' },
  { status: 'Registered', count: 15, percentage: 11.8, color: '#06B6D4' },
  { status: 'Not Interested', count: 10, percentage: 7.9, color: '#EF4444' },
];

export const leaderboardData: LeaderboardEntry[] = [
  { rank: 1, name: 'Michael Chen', xp: 9500, change: 1, avatar: 'MC' },
  { rank: 2, name: 'Emily Rodriguez', xp: 9200, change: -1, avatar: 'ER' },
  { rank: 3, name: 'Sarah Johnson', xp: 8750, change: 2, avatar: 'SJ' },
  { rank: 4, name: 'David Kim', xp: 8600, change: -1, avatar: 'DK' },
  { rank: 5, name: 'Lisa Anderson', xp: 8400, change: 1, avatar: 'LA' },
  { rank: 6, name: 'James Wilson', xp: 8100, change: -2, avatar: 'JW' },
  { rank: 7, name: 'Maria Garcia', xp: 7900, change: 0, avatar: 'MG' },
  { rank: 8, name: 'Robert Taylor', xp: 7700, change: 3, avatar: 'RT' },
  { rank: 9, name: 'Jennifer Lee', xp: 7500, change: -1, avatar: 'JL' },
  { rank: 10, name: 'Thomas Brown', xp: 7300, change: 1, avatar: 'TB' },
];

export const recentActivities: Activity[] = [
  {
    id: '1',
    type: 'enrollment',
    description: 'John Smith enrolled in Computer Science Program',
    timestamp: '10 minutes ago',
    icon: 'UserCheck',
  },
  {
    id: '2',
    type: 'follow-up',
    description: 'Completed follow-up call with Emma Wilson',
    timestamp: '1 hour ago',
    icon: 'Phone',
  },
  {
    id: '3',
    type: 'lead',
    description: 'New lead added: Alex Martinez - Business Administration',
    timestamp: '2 hours ago',
    icon: 'UserPlus',
  },
  {
    id: '4',
    type: 'achievement',
    description: 'Earned "Top Closer" badge for March',
    timestamp: '3 hours ago',
    icon: 'Award',
  },
  {
    id: '5',
    type: 'status',
    description: 'Updated status for 5 leads to "Interested"',
    timestamp: '5 hours ago',
    icon: 'CheckCircle',
  },
];

export const upcomingTasks: Task[] = [
  {
    id: '1',
    title: 'Follow-up call with Jessica Brown',
    dueDate: 'Today, 2:00 PM',
    priority: 'high',
    completed: false,
  },
  {
    id: '2',
    title: 'Send enrollment documents to Mark Davis',
    dueDate: 'Today, 4:30 PM',
    priority: 'high',
    completed: false,
  },
  {
    id: '3',
    title: 'Campus tour with Miller family',
    dueDate: 'Tomorrow, 10:00 AM',
    priority: 'medium',
    completed: false,
  },
  {
    id: '4',
    title: 'Weekly team meeting',
    dueDate: 'Tomorrow, 2:00 PM',
    priority: 'medium',
    completed: false,
  },
  {
    id: '5',
    title: 'Review scholarship applications',
    dueDate: 'Mar 20, 9:00 AM',
    priority: 'low',
    completed: false,
  },
];

export const badges = [
  { id: '1', name: 'Top Closer', icon: 'Trophy', earned: true },
  { id: '2', name: 'Quick Responder', icon: 'Zap', earned: true },
  { id: '3', name: '50 Enrollments', icon: 'Target', earned: true },
  { id: '4', name: 'Team Player', icon: 'Users', earned: true },
  { id: '5', name: '100 Enrollments', icon: 'Star', earned: false },
  { id: '6', name: 'Master Closer', icon: 'Crown', earned: false },
];
