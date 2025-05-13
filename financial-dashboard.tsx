import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, DollarSign, 
  CreditCard, TrendingUp, Calendar, BarChart2, 
  FileText, Users, Briefcase, Download
} from 'lucide-react';

// Dashboard header with summary stats
const DashboardHeader = ({ financialData, loading }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const totalRevenue = loading ? 0 : financialData.cashFlow.income.reduce((sum, val) => sum + val, 0);
  const totalExpenses = loading ? 0 : financialData.cashFlow.expenses.reduce((sum, val) => sum + val, 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMarginPct = totalRevenue ? (netProfit / totalRevenue * 100).toFixed(1) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <StatCard 
        title="Revenue" 
        value={formatCurrency(totalRevenue)} 
        trend="8.2%" 
        trendDirection="up" 
        icon={DollarSign} 
        color="blue"
      />
      <StatCard 
        title="Expenses" 
        value={formatCurrency(totalExpenses)} 
        trend="3.1%" 
        trendDirection="up" 
        icon={BarChart2} 
        color="red"
      />
      <StatCard 
        title="Net Profit" 
        value={formatCurrency(netProfit)}
        trend="12.5%" 
        trendDirection="up" 
        icon={TrendingUp} 
        color="green"
      />
      <StatCard 
        title="Profit Margin" 
        value={`${profitMarginPct}%`} 
        trend="2.3%" 
        trendDirection="up" 
        icon={TrendingUp} 
        color="purple"
      />
    </div>
  );
};

// Reusable stat card for dashboard metrics
const StatCard = ({ title, value, trend, trendDirection, icon, color = 'blue' }) => {
  const Icon = icon;
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-500',
    green: 'bg-green-50 text-green-500',
    red: 'bg-red-50 text-red-500',
    purple: 'bg-purple-50 text-purple-500',
    yellow: 'bg-yellow-50 text-yellow-500',
  };
  const iconColorClass = colorClasses[color] || colorClasses.blue;
  
  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className={`p-2 rounded-lg ${iconColorClass}`}>
          <Icon size={20} />
        </div>
        <div className="text-xs font-medium text-gray-500">Last 30 days</div>
      </div>
      <h3 className="text-gray-600 text-sm font-medium mb-1">{title}</h3>
      <div className="flex items-center">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        {trend && (
          <div className={`flex items-center ml-2 text-sm ${
            trendDirection === 'up' ? 'text-green-500' : 'text-red-500'
          }`}>
            {trendDirection === 'up' 
              ? <ArrowUpRight size={16} /> 
              : <ArrowDownRight size={16} />}
            <span className="ml-1">{trend}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Cash flow chart component
const CashFlowChart = ({ data, loading }) => {
  if (loading) return <div className="h-80 flex items-center justify-center">Loading chart data...</div>;

  const chartData = data.months.map((month, i) => ({
    month,
    income: data.income[i],
    expenses: data.expenses[i],
    profit: data.income[i] - data.expenses[i]
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Cash Flow</h2>
        <div className="flex space-x-2">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-1"></div>
            <span className="text-xs text-gray-600">Income</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-1"></div>
            <span className="text-xs text-gray-600">Expenses</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-1"></div>
            <span className="text-xs text-gray-600">Profit</span>
          </div>
        </div>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={0} barCategoryGap="10%">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="income" name="Income" fill="#3B82F6" />
            <Bar dataKey="expenses" name="Expenses" fill="#EF4444" />
            <Line 
              type="monotone" 
              dataKey="profit" 
              name="Profit" 
              stroke="#10B981" 
              strokeWidth={2} 
              dot={{ r: 4 }} 
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Account balances component
const AccountBalances = ({ data, loading }) => {
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  if (loading) return <div className="h-80 flex items-center justify-center">Loading account data...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Account Balances</h2>
        <button className="text-blue-600 text-sm flex items-center">
          <Download size={16} className="mr-1" />
          Export
        </button>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
              label={({name, percent}) => `${name} (${(percent * 100).toFixed(0)}%)`}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Invoice status component
const InvoiceStatus = ({ data, loading }) => {
  if (loading) return <div className="h-60 flex items-center justify-center">Loading invoice data...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice Status</h2>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              label={({name, value}) => `${name}: ${value}%`}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${value}%`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-4">
        <button className="text-blue-600 text-sm font-medium">View All Invoices</button>
        <button className="text-blue-600 text-sm font-medium">Create Invoice</button>
      </div>
    </div>
  );
};

// Stabulum transactions component
const StabulumTransactions = ({ data, loading }) => {
  if (loading) return <div className="h-60 flex items-center justify-center">Loading Stabulum data...</div>;

  const stabulumData = data.map(item => ({
    date: item.date,
    value: item.type === 'in' ? item.value : -item.value
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Stabulum Transactions</h2>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stabulumData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value) => `$${Math.abs(value).toLocaleString()}`} />
            <Bar dataKey="value">
              {stabulumData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.value >= 0 ? "#4CAF50" : "#F44336"} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-4">
        <button className="text-blue-600 text-sm font-medium">View All Transactions</button>
        <button className="text-blue-600 text-sm font-medium">New Transaction</button>
      </div>
    </div>
  );
};

// Profit margin chart component
const ProfitMarginChart = ({ data, loading }) => {
  if (loading) return <div className="h-60 flex items-center justify-center">Loading profit data...</div>;

  const chartData = data.months.map((month, i) => ({
    month,
    value: data.values[i]
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Profit Margin (%)</h2>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis unit="%" />
            <Tooltip formatter={(value) => `${value}%`} />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#8884d8" 
              fill="#8884d8" 
              fillOpacity={0.3} 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-4">
        <span className="text-sm text-gray-600">
          Average: {chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length}%
        </span>
        <button className="text-blue-600 text-sm font-medium">View Report</button>
      </div>
    </div>
  );
};

// Main financial dashboard component
const FinancialDashboard = () => {
  const [financialData, setFinancialData] = useState(null);
  const [timeRange, setTimeRange] = useState('sixMonths');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real implementation, this would fetch from the API
    const fetchData = async () => {
      setLoading(true);
      try {
        // Replace with actual API call in production
        // const response = await fetch(`/api/dashboard/financial?timeRange=${timeRange}`);
        // const data = await response.json();
        // setFinancialData(data);
        
        // Mock data for demonstration
        setTimeout(() => {
          setFinancialData({
            cashFlow: {
              months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
              income: [42000, 48000, 52000, 58000, 63000, 68000],
              expenses: [32000, 35000, 38000, 40000, 42000, 45000]
            },
            accountBalances: [
              { name: 'Operating', value: 150000 },
              { name: 'Payroll', value: 58000 },
              { name: 'Tax Reserve', value: 42000 },
              { name: 'Stabulum', value: 75000 }
            ],
            invoiceStatus: [
              { name: 'Paid', value: 72, color: '#4CAF50' },
              { name: 'Pending', value: 18, color: '#2196F3' },
              { name: 'Overdue', value: 10, color: '#F44336' }
            ],
            stabulumTransactions: [
              { date: 'May 3', value: 12000, type: 'in' },
              { date: 'May 8', value: 5000, type: 'out' },
              { date: 'May 12', value: 8000, type: 'in' },
              { date: 'May 18', value: 6500, type: 'out' },
              { date: 'May 22', value: 15000, type: 'in' },
              { date: 'May 25', value: 7200, type: 'out' }
            ],
            profitMargin: {
              months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
              values: [23.8, 27.1, 26.9, 31.0, 33.3, 33.8]
            }
          });
          setLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Error fetching financial data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  const fetchFinancialData = async () => {
    // In a real app, this would make an actual API call
    // For now, we're just simulating with the mock data
    
    // Example of what the real API call would look like:
    // try {
    //   const response = await fetch(`/api/dashboard/financial?timeRange=${timeRange}`);
    //   if (!response.ok) throw new Error('Network response was not ok');
    //   const data = await response.json();
    //   return data;
    // } catch (error) {
    //   console.error("Failed to fetch financial data:", error);
    //   throw error;
    // }
  };

  return (
    <div className="bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Financial Dashboard</h1>
          <div className="flex space-x-2">
            <select 
              className="bg-white border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="oneMonth">Last Month</option>
              <option value="threeMonths">Last 3 Months</option>
              <option value="sixMonths">Last 6 Months</option>
              <option value="ytd">Year to Date</option>
              <option value="oneYear">Last Year</option>
            </select>
            <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm flex items-center">
              <Download size={16} className="mr-2" />
              Export
            </button>
          </div>
        </div>
        
        {/* Stats summary cards */}
        {financialData && (
          <DashboardHeader 
            financialData={financialData} 
            loading={loading} 
          />
        )}
        
        {/* Main charts section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Cash Flow Chart */}
          {financialData && (
            <CashFlowChart 
              data={financialData.cashFlow} 
              loading={loading} 
            />
          )}
          
          {/* Account Balances */}
          {financialData && (
            <AccountBalances 
              data={financialData.accountBalances} 
              loading={loading} 
            />
          )}
        </div>
        
        {/* Secondary charts section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Invoice Status */}
          {financialData && (
            <InvoiceStatus 
              data={financialData.invoiceStatus} 
              loading={loading} 
            />
          )}
          
          {/* Profit Margin Trend */}
          {financialData && (
            <ProfitMarginChart 
              data={financialData.profitMargin} 
              loading={loading} 
            />
          )}
          
          {/* Stabulum Transactions */}
          {financialData && (
            <StabulumTransactions 
              data={financialData.stabulumTransactions} 
              loading={loading} 
            />
          )}
        </div>
        
        {/* Quick actions section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-4">
              <div className="bg-blue-100 p-3 rounded-full mr-4">
                <FileText className="text-blue-500" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">New Invoice</h3>
                <p className="text-sm text-gray-500">Create a new customer invoice</p>
              </div>
            </div>
            <button className="w-full bg-blue-50 text-blue-700 py-2 rounded-md text-sm font-medium">
              Create Invoice
            </button>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-4">
              <div className="bg-green-100 p-3 rounded-full mr-4">
                <CreditCard className="text-green-500" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Stabulum Transfer</h3>
                <p className="text-sm text-gray-500">Send or receive Stabulum tokens</p>
              </div>
            </div>
            <button className="w-full bg-green-50 text-green-700 py-2 rounded-md text-sm font-medium">
              New Transfer
            </button>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-4">
              <div className="bg-purple-100 p-3 rounded-full mr-4">
                <Briefcase className="text-purple-500" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Record Expense</h3>
                <p className="text-sm text-gray-500">Enter a new business expense</p>
              </div>
            </div>
            <button className="w-full bg-purple-50 text-purple-700 py-2 rounded-md text-sm font-medium">
              Add Expense
            </button>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-4">
              <div className="bg-yellow-100 p-3 rounded-full mr-4">
                <BarChart2 className="text-yellow-500" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Financial Reports</h3>
                <p className="text-sm text-gray-500">Generate financial statements</p>
              </div>
            </div>
            <button className="w-full bg-yellow-50 text-yellow-700 py-2 rounded-md text-sm font-medium">
              View Reports
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialDashboard;