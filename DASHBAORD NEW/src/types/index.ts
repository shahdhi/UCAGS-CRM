export interface Officer {
  id: string;
  name: string;
  designation: string;
  email: string;
  phone: string;
  avatar: string;
  currentXP: number;
  currentLevel: number;
  xpToNextLevel: number;
  rank: number;
  totalOfficers: number;
  rankChange: number;
}

export interface LeadStatus {
  status: string;
  count: number;
  percentage: number;
  color: string;
}

export interface Lead {
  id: string;
  name: string;
  course: string;
  status: string;
  lastContact: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  icon: string;
}

export interface Task {
  id: string;
  title: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  xp: number;
  change: number;
  avatar: string;
}

export interface PerformanceMetrics {
  enrollments: number;
  enrollmentsTrend: number;
  conversionRate: number;
  conversionTrend: number;
  pendingFollowups: number;
  activeLeads: number;
  revenue: number;
  revenueTrend: number;
  avgResponseTime: number;
}

export interface XPDataPoint {
  month: string;
  xp: number;
}
