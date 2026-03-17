import { UserPlus, Calendar, RefreshCw, FileText, Mail } from 'lucide-react';

export default function QuickActions() {
  const actions = [
    {
      label: 'Add New Lead',
      icon: UserPlus,
      color: 'blue',
      description: 'Register a new prospect',
    },
    {
      label: 'Schedule Follow-up',
      icon: Calendar,
      color: 'green',
      description: 'Plan your next call',
    },
    {
      label: 'Update Lead Status',
      icon: RefreshCw,
      color: 'orange',
      description: 'Track lead progress',
    },
    {
      label: 'Generate Report',
      icon: FileText,
      color: 'cyan',
      description: 'Export your data',
    },
    {
      label: 'Send Bulk Messages',
      icon: Mail,
      color: 'emerald',
      description: 'Communicate with leads',
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; hover: string; icon: string; text: string }> = {
      blue: {
        bg: 'bg-blue-500',
        hover: 'hover:bg-blue-600',
        icon: 'bg-blue-100 text-blue-600',
        text: 'text-blue-600',
      },
      green: {
        bg: 'bg-green-500',
        hover: 'hover:bg-green-600',
        icon: 'bg-green-100 text-green-600',
        text: 'text-green-600',
      },
      orange: {
        bg: 'bg-orange-500',
        hover: 'hover:bg-orange-600',
        icon: 'bg-orange-100 text-orange-600',
        text: 'text-orange-600',
      },
      cyan: {
        bg: 'bg-cyan-500',
        hover: 'hover:bg-cyan-600',
        icon: 'bg-cyan-100 text-cyan-600',
        text: 'text-cyan-600',
      },
      emerald: {
        bg: 'bg-emerald-500',
        hover: 'hover:bg-emerald-600',
        icon: 'bg-emerald-100 text-emerald-600',
        text: 'text-emerald-600',
      },
    };
    return colors[color];
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
        <p className="text-sm text-gray-500">Streamline your workflow</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        {actions.map((action, index) => {
          const Icon = action.icon;
          const colors = getColorClasses(action.color);

          return (
            <button
              key={index}
              className={`w-full flex items-center p-4 rounded-lg ${colors.bg} ${colors.hover} text-white transition-all hover:shadow-lg group`}
            >
              <div className={`${colors.icon} p-3 rounded-lg mr-4 group-hover:scale-110 transition-transform`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold">{action.label}</p>
                <p className="text-xs opacity-90">{action.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
