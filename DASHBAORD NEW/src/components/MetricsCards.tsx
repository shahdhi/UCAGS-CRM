import { PerformanceMetrics } from '../types';
import { TrendingUp, TrendingDown, UserCheck, Target, Clock, Users, DollarSign, Timer } from 'lucide-react';

interface MetricsCardsProps {
  metrics: PerformanceMetrics;
}

export default function MetricsCards({ metrics }: MetricsCardsProps) {
  const cards = [
    {
      title: 'Total Enrollments',
      value: metrics.enrollments,
      trend: metrics.enrollmentsTrend,
      icon: UserCheck,
      color: 'blue',
      suffix: ' this month',
    },
    {
      title: 'Conversion Rate',
      value: metrics.conversionRate,
      trend: metrics.conversionTrend,
      icon: Target,
      color: 'green',
      suffix: '%',
    },
    {
      title: 'Pending Follow-ups',
      value: metrics.pendingFollowups,
      trend: null,
      icon: Clock,
      color: 'orange',
      suffix: ' tasks',
      urgent: metrics.pendingFollowups > 15,
    },
    {
      title: 'Active Leads',
      value: metrics.activeLeads,
      trend: null,
      icon: Users,
      color: 'cyan',
      suffix: ' leads',
    },
    {
      title: 'Revenue Generated',
      value: `$${(metrics.revenue / 1000).toFixed(0)}K`,
      trend: metrics.revenueTrend,
      icon: DollarSign,
      color: 'emerald',
      suffix: '',
    },
    {
      title: 'Avg Response Time',
      value: metrics.avgResponseTime,
      trend: null,
      icon: Timer,
      color: 'violet',
      suffix: ' hours',
    },
  ];

  const getColorClasses = (color: string, urgent?: boolean) => {
    if (urgent) {
      return {
        bg: 'bg-red-50',
        icon: 'bg-red-100 text-red-600',
        text: 'text-red-600',
      };
    }

    const colors: Record<string, { bg: string; icon: string; text: string }> = {
      blue: { bg: 'bg-blue-50', icon: 'bg-blue-100 text-blue-600', text: 'text-blue-600' },
      green: { bg: 'bg-green-50', icon: 'bg-green-100 text-green-600', text: 'text-green-600' },
      orange: { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600', text: 'text-orange-600' },
      cyan: { bg: 'bg-cyan-50', icon: 'bg-cyan-100 text-cyan-600', text: 'text-cyan-600' },
      emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600' },
      violet: { bg: 'bg-violet-50', icon: 'bg-violet-100 text-violet-600', text: 'text-violet-600' },
    };

    return colors[color];
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        const colors = getColorClasses(card.color, card.urgent);

        return (
          <div key={index} className={`${colors.bg} rounded-lg shadow-md p-6 border border-gray-200`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-2">{card.title}</p>
                <div className="flex items-baseline">
                  <h3 className="text-3xl font-bold text-gray-900">
                    {typeof card.value === 'number' && !card.suffix.includes('$') ? card.value : card.value}
                  </h3>
                  {card.suffix && <span className="text-sm text-gray-600 ml-1">{card.suffix}</span>}
                </div>
                {card.trend !== null && (
                  <div className="flex items-center mt-2">
                    {card.trend > 0 ? (
                      <>
                        <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                        <span className="text-sm font-medium text-green-600">+{card.trend}%</span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                        <span className="text-sm font-medium text-red-600">{card.trend}%</span>
                      </>
                    )}
                    <span className="text-xs text-gray-500 ml-1">vs last month</span>
                  </div>
                )}
              </div>
              <div className={`${colors.icon} p-3 rounded-lg`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
