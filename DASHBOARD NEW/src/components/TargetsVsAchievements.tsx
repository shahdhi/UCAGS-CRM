import { Target, TrendingUp } from 'lucide-react';

interface TargetData {
  category: string;
  target: number;
  achieved: number;
  unit: string;
}

export default function TargetsVsAchievements() {
  const targets: TargetData[] = [
    { category: 'Enrollments', target: 50, achieved: 42, unit: 'students' },
    { category: 'New Leads', target: 100, achieved: 87, unit: 'leads' },
    { category: 'Follow-ups', target: 150, achieved: 142, unit: 'calls' },
    { category: 'Conversions', target: 35, achieved: 28, unit: '%' },
  ];

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'from-green-500 to-emerald-500';
    if (percentage >= 70) return 'from-blue-500 to-cyan-500';
    if (percentage >= 50) return 'from-orange-500 to-yellow-500';
    return 'from-red-500 to-pink-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Monthly Targets vs Achievements</h3>
          <p className="text-sm text-gray-500">Track your progress</p>
        </div>
        <Target className="w-8 h-8 text-blue-600" />
      </div>

      <div className="space-y-6">
        {targets.map((item, index) => {
          const percentage = (item.achieved / item.target) * 100;
          const progressColor = getProgressColor(percentage);

          return (
            <div key={index}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">{item.category}</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-gray-900">
                    {item.achieved} / {item.target}
                  </span>
                  <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                </div>
              </div>

              <div className="relative">
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`bg-gradient-to-r ${progressColor} h-3 rounded-full transition-all duration-500 relative`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
                  </div>
                </div>
                <div className="absolute -top-1 right-0 transform translate-x-1/2">
                  <div className="bg-white border-2 border-gray-300 rounded-full px-2 py-0.5">
                    <span className="text-xs font-semibold text-gray-700">{percentage.toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {percentage >= 90 && (
                <div className="flex items-center mt-1 text-green-600">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  <span className="text-xs font-medium">On track to exceed target!</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Overall Progress</span>
          <span className="text-lg font-bold text-blue-600">
            {(
              (targets.reduce((sum, t) => sum + (t.achieved / t.target) * 100, 0) / targets.length)
            ).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
