import { Activity } from '../types';
import { UserCheck, Phone, UserPlus, Award, CheckCircle, Clock } from 'lucide-react';

interface ActivityFeedProps {
  activities: Activity[];
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    UserCheck,
    Phone,
    UserPlus,
    Award,
    CheckCircle,
    Clock,
  };

  const getActivityColor = (type: string) => {
    const colors: Record<string, { bg: string; icon: string }> = {
      enrollment: { bg: 'bg-green-50', icon: 'bg-green-500' },
      'follow-up': { bg: 'bg-blue-50', icon: 'bg-blue-500' },
      lead: { bg: 'bg-cyan-50', icon: 'bg-cyan-500' },
      achievement: { bg: 'bg-yellow-50', icon: 'bg-yellow-500' },
      status: { bg: 'bg-gray-50', icon: 'bg-gray-500' },
    };
    return colors[type] || { bg: 'bg-gray-50', icon: 'bg-gray-500' };
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        <p className="text-sm text-gray-500">Your latest updates</p>
      </div>

      <div className="space-y-4">
        {activities.map((activity) => {
          const Icon = iconMap[activity.icon];
          const colors = getActivityColor(activity.type);

          return (
            <div key={activity.id} className={`flex items-start space-x-3 ${colors.bg} p-3 rounded-lg`}>
              <div className={`${colors.icon} p-2 rounded-full text-white flex-shrink-0`}>
                {Icon && <Icon className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{activity.description}</p>
                <p className="text-xs text-gray-500 mt-1">{activity.timestamp}</p>
              </div>
            </div>
          );
        })}
      </div>

      <button className="mt-4 w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
        View All Activity
      </button>
    </div>
  );
}
