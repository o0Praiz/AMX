import React, { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { Clock, DollarSign, CreditCard, Activity, TrendingUp, Users, Briefcase } from 'lucide-react';

// Sample data - in a real app this would come from API
const cashFlowData = [
  { month: 'Jan', income: 12000, expenses: 8000 },
  { month: 'Feb', income: 15000, expenses: 10000 },
  { month: 'Mar', income: 18000, expenses: 12000 },
  { month: 'Apr', income: 16000, expenses: 9500 },
  { month: 'May', income: 21000, expenses: 13000 },
  { month: 'Jun', income: 19000, expenses: 12500 }
];

const accountBalances = [
  { name: 'Operating', value: 45000 },
  { name: 'Payroll', value: 25000 },
  { name: 'Tax Reserve', value: 15000 },
  { name: 'Savings', value: 35000 }
];

const invoiceStats = [
  { status: 'Paid', count: 28 },
  { status: 'Pending', count: 12 },
  { status: 'Overdue', count: 5 }
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const DashboardCard = ({ title, value, icon, trend, trendDirection }) => {
  const Icon = icon;
  
  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
        <Icon className="text-blue-500" size={20} />
      </div>
      <div className="flex items-baseline">
        <span className="text-2xl font-semibold">{value}</span>
        {trend && (
          <span className={`ml-2 text-sm ${trendDirection === 'up' ? 'text-green-500' : 'text-red-500'}`}>
            {trendDirection === 'up' ? '↑' : '↓'} {trend}
          </span>
        )}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [stabulumBalance, setStabulumBalance] = useState(2500);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };
  
  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };
  
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Financial Dashboard</h1>
        <div className="text-right">
          <div className="text-gray-500">{formatDate(currentDate)}</div>
          <div className="text-gray-500 font-semibold">{formatTime(currentDate)}</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <DashboardCard 
          title="Cash Balance" 
          value="$120,000" 
          icon={DollarSign}
          trend="12%"
          trendDirection="up"
        />
        <DashboardCard 
          title="Stabulum Balance" 
          value={`${stabulumBalance} STBL`}
          icon={CreditCard}
          trend="5%"
          trendDirection="up"
        />
        <DashboardCard 
          title="Outstanding Invoices" 
          value="$28,500" 
          icon={Activity}
          trend="8%"
          trendDirection="down"
        />
        <DashboardCard 
          title="Monthly Revenue" 
          value="$85,000" 
          icon={TrendingUp}
          trend="15%"
          trendDirection="up"
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Cash Flow</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => `$${value}`} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="income" 
                  stroke="#0088FE" 
                  strokeWidth={2} 
                  activeDot={{ r: 8 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="expenses" 
                  stroke="#FF8042" 
                  strokeWidth={2} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Account Balances</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={accountBalances}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {accountBalances.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `$${value}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Invoice Status</h2>
            <span className="text-blue-500 text-sm cursor-pointer">View All</span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={invoiceStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8">
                  {invoiceStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Customers</h2>
            <span className="text-blue-500 text-sm cursor-pointer">View All</span>
          </div>
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="bg-blue-100 p-2 rounded-full mr-3">
                <Users size={20} className="text-blue-500" />
              </div>
              <div>
                <p className="font-medium">Acme Corporation</p>
                <p className="text-sm text-gray-500">Last transaction: 2 days ago</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="bg-green-100 p-2 rounded-full mr-3">
                <Users size={20} className="text-green-500" />
              </div>
              <div>
                <p className="font-medium">Globex Industries</p>
                <p className="text-sm text-gray-500">Last transaction: 5 days ago</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="bg-yellow-100 p-2 rounded-full mr-3">
                <Users size={20} className="text-yellow-500" />
              </div>
              <div>
                <p className="font-medium">Initech LLC</p>
                <p className="text-sm text-gray-500">Last transaction: 1 week ago</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Transactions</h2>
            <span className="text-blue-500 text-sm cursor-pointer">View All</span>
          </div>
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="bg-purple-100 p-2 rounded-full mr-3">
                <Briefcase size={20} className="text-purple-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Invoice Payment</p>
                <p className="text-sm text-gray-500">Acme Corporation</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-green-500">+$12,500</p>
                <p className="text-sm text-gray-500">May 10, 2025</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="bg-red-100 p-2 rounded-full mr-3">
                <Briefcase size={20} className="text-red-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Vendor Payment</p>
                <p className="text-sm text-gray-500">Office Supplies Inc.</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-red-500">-$2,150</p>
                <p className="text-sm text-gray-500">May 8, 2025</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="bg-blue-100 p-2 rounded-full mr-3">
                <Briefcase size={20} className="text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Stabulum Transfer</p>
                <p className="text-sm text-gray-500">Internal</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-blue-500">500 STBL</p>
                <p className="text-sm text-gray-500">May 7, 2025</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
