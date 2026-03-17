import { LeadStatus } from '../types';

interface LeadStatusChartProps {
  data: LeadStatus[];
}

export default function LeadStatusChart({ data }: LeadStatusChartProps) {
  const totalLeads = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Lead Status Distribution</h3>
        <p className="text-sm text-gray-500">Total: {totalLeads} leads</p>
      </div>

      <div className="space-y-4">
        {data.map((item, index) => (
          <div key={index} className="group">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                ></div>
                <span className="text-sm font-medium text-gray-700">{item.status}</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-600">{item.count} leads</span>
                <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                  {item.percentage.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full transition-all duration-500 group-hover:opacity-90"
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: item.color,
                }}
              ></div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Conversion Ready</p>
            <p className="text-xl font-bold text-green-600">
              {data.filter(d => ['Interested', 'Enrolled', 'Registered'].includes(d.status))
                .reduce((sum, d) => sum + d.count, 0)}
            </p>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">In Pipeline</p>
            <p className="text-xl font-bold text-blue-600">
              {data.filter(d => ['New', 'Contacted'].includes(d.status))
                .reduce((sum, d) => sum + d.count, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
