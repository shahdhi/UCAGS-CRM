import { XPDataPoint } from '../types';
import { TrendingUp } from 'lucide-react';

interface XPTrendChartProps {
  data: XPDataPoint[];
}

export default function XPTrendChart({ data }: XPTrendChartProps) {
  const maxXP = Math.max(...data.map(d => d.xp));
  const minXP = Math.min(...data.map(d => d.xp));
  const range = maxXP - minXP;

  const getHeight = (xp: number) => {
    return ((xp - minXP) / range) * 100;
  };

  const xpGrowth = ((data[data.length - 1].xp - data[0].xp) / data[0].xp * 100).toFixed(1);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">XP Performance Trend</h3>
          <p className="text-sm text-gray-500">Last 6 months</p>
        </div>
        <div className="flex items-center bg-green-50 px-3 py-1 rounded-lg">
          <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
          <span className="text-sm font-semibold text-green-600">+{xpGrowth}%</span>
        </div>
      </div>

      <div className="relative h-64">
        <div className="absolute inset-0 flex items-end justify-between space-x-4 px-2">
          {data.map((point, index) => {
            const height = getHeight(point.xp);
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div className="w-full flex flex-col items-center justify-end h-full group">
                  <div className="relative mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap">
                      {point.xp.toLocaleString()} XP
                    </div>
                  </div>
                  <div
                    className="w-full bg-gradient-to-t from-blue-500 to-cyan-400 rounded-t-lg transition-all duration-500 hover:from-blue-600 hover:to-cyan-500 relative overflow-hidden group-hover:shadow-lg"
                    style={{ height: `${height}%`, minHeight: '20px' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white to-transparent opacity-20"></div>
                  </div>
                </div>
                <div className="text-xs font-medium text-gray-600 mt-2">{point.month}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
        <div>
          <p className="text-xs text-gray-500">Current XP</p>
          <p className="text-lg font-bold text-gray-900">{data[data.length - 1].xp.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Highest</p>
          <p className="text-lg font-bold text-gray-900">{maxXP.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Average</p>
          <p className="text-lg font-bold text-gray-900">
            {Math.round(data.reduce((sum, d) => sum + d.xp, 0) / data.length).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
