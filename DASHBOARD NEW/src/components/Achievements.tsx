import { Trophy, Zap, Target, Users, Star, Crown } from 'lucide-react';

interface Badge {
  id: string;
  name: string;
  icon: string;
  earned: boolean;
}

interface AchievementsProps {
  badges: Badge[];
}

export default function Achievements({ badges }: AchievementsProps) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Trophy,
    Zap,
    Target,
    Users,
    Star,
    Crown,
  };

  const earnedCount = badges.filter(b => b.earned).length;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Achievements</h3>
        <p className="text-sm text-gray-500">
          {earnedCount} of {badges.length} badges earned
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {badges.map((badge) => {
          const Icon = iconMap[badge.icon];

          return (
            <div
              key={badge.id}
              className={`relative flex flex-col items-center p-4 rounded-lg border-2 transition-all ${
                badge.earned
                  ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-400 shadow-md hover:shadow-lg'
                  : 'bg-gray-50 border-gray-200 opacity-50'
              }`}
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 ${
                  badge.earned
                    ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-lg'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {Icon && <Icon className="w-8 h-8" />}
              </div>
              <p className={`text-xs font-semibold text-center ${badge.earned ? 'text-gray-900' : 'text-gray-500'}`}>
                {badge.name}
              </p>
              {badge.earned && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
        <p className="text-xs text-gray-700 text-center">
          {earnedCount < badges.length
            ? `Unlock ${badges.length - earnedCount} more badge${badges.length - earnedCount > 1 ? 's' : ''} to become a Master Officer!`
            : 'Congratulations! You have unlocked all badges!'}
        </p>
      </div>
    </div>
  );
}
