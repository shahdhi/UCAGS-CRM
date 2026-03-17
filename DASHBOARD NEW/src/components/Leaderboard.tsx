import { LeaderboardEntry } from '../types';
import { Trophy, TrendingUp, TrendingDown, Minus, Medal, Award } from 'lucide-react';

interface LeaderboardProps {
  data: LeaderboardEntry[];
  currentUserId?: string;
}

export default function Leaderboard({ data, currentUserId = '3' }: LeaderboardProps) {
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Award className="w-5 h-5 text-orange-600" />;
    return null;
  };

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white';
    if (rank === 2) return 'bg-gradient-to-br from-gray-300 to-gray-500 text-white';
    if (rank === 3) return 'bg-gradient-to-br from-orange-400 to-orange-600 text-white';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Leaderboard</h3>
          <p className="text-sm text-gray-500">Top 10 performers this month</p>
        </div>
        <Trophy className="w-8 h-8 text-yellow-500" />
      </div>

      <div className="space-y-3">
        {data.map((entry) => {
          const isCurrentUser = entry.rank.toString() === currentUserId;

          return (
            <div
              key={entry.rank}
              className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                isCurrentUser
                  ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 shadow-md'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-4 flex-1">
                <div
                  className={`w-10 h-10 rounded-full ${getRankBadgeColor(entry.rank)} flex items-center justify-center font-bold text-sm flex-shrink-0`}
                >
                  {entry.rank <= 3 ? getRankIcon(entry.rank) : `#${entry.rank}`}
                </div>

                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {entry.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold truncate ${isCurrentUser ? 'text-blue-900' : 'text-gray-900'}`}>
                      {entry.name}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">You</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">{entry.xp.toLocaleString()} XP</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center ml-4">
                {entry.change > 0 && (
                  <div className="flex items-center text-green-600">
                    <TrendingUp className="w-4 h-4 mr-1" />
                    <span className="text-sm font-semibold">+{entry.change}</span>
                  </div>
                )}
                {entry.change < 0 && (
                  <div className="flex items-center text-red-600">
                    <TrendingDown className="w-4 h-4 mr-1" />
                    <span className="text-sm font-semibold">{entry.change}</span>
                  </div>
                )}
                {entry.change === 0 && (
                  <div className="flex items-center text-gray-400">
                    <Minus className="w-4 h-4" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-xs text-blue-800 text-center">
          Keep up the great work! You're in the top 10% of all officers.
        </p>
      </div>
    </div>
  );
}
