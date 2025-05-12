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
  Area,
  AreaChart,
  Cell,
  ComposedChart 
} from 'recharts';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  Calendar, 
  BarChart2, 
  TrendingUp, 
  Users, 
  FileText,
  CreditCard
} from 'lucide-react';

// Mock data - would be replaced with API calls in production
const MOCK_FINANCIAL_DATA = {
  cashFlow: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    income: [35000, 42000, 38000, 45000, 50000, 55000],
    expenses: [28000, 32000, 30000, 34000, 36000, 38000]
  },
  accountBalances: [
    { name: 'Operating', value: 125000 },
    { name: 'Payroll', value: 45000 },
    { name: 'Tax Reserve', value: 30000 },
    { name: 'Stabulum', value: 50000 }
  ],
  revenueByCategory: [
    { name: 'Services', value: 120000 },
    { name: 'Products', value: 80000 },
    { name: 'Consulting', value: 60000 },
    { name: 'Subscriptions', value: 40000 }
  ],
  expensesByCategory: [
    { name: 'Payroll', value: 85000 },
    { name: 'Rent', value: 35000 },
    { name: 'Marketing', value: 25000 },
    { name: 'Software', value: 15000 },
    { name: 'Utilities', value: 10000 },
    { name: 'Other', value: 20000 }
  ],
  topCustomers: [
    { name: 'Acme Inc.', value: 45000 },
    { name: 'Globex Corp', value: 32000 },
    { name: 'Initech LLC', value: 28000 },
    { name: 'Umbrella Co.', value: 22000 },
    { name: 'Stark Industries', value: 18000 }
  ],
  invoiceStatus: [
    { name: 'Paid', value: 78, color: '#4CAF50' },
    { name: 'Pending', value: 14, color: '#2196F3' },
    { name: 'Overdue', value: 8, color: '#F44336' }
  ],
  stabulumTransactions: [
    { date: 'May 1', value: 8500, type: 'in' },
    { date: 'May 3', value: 3200, type: 'out' },
    { date: 'May 7', value: 12000, type: 'in' },
    { date: 'May 12', value: 5800, type: 'out' },
    { date: 'May 18', value: 9500, type: 'in' },
    { date: 'May 22', value: 7600, type: 'out' }
  ],
  profitMargin: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    values: [18, 20, 17, 22, 24, 26]
  }
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const StatCard = ({ title, value, trend, trendDirection, icon, color = 'blue' }) => {
  const Icon = icon;
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-500',
    green: 'bg-green-50 text-green-500',
    red: 'bg-red-50 text-red-500',
    purple: 'bg-purple-50 text-purple-500',
    orange: 'bg-orange-50 text-orange-500',
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

const FinancialDashboard = () => {
  const [timeRange, setTimeRange] = useState('sixMonths');
  const [data, setData] = useState(MOCK_FINANCIAL_DATA);
  
  // In a real implementation, we would fetch data from the API
  useEffect(() => {
    // Example API call
    // const fetchData = async () => {
    //   const response = await fetch(`/api/dashboard/financial?timeRange=${timeRange}`);
    //   const data = await response.json();
    //   setData(data);
    // };
    // fetchData();
    
    // For now, we'll just use the mock data
    setData(MOCK_FINANCIAL_DATA);
  }, [timeRange]);
  
  // Format cashflow data for chart
  const cashFlowData = data.cashFlow.months.map((month, index) => ({
    month,
    income: data.cashFlow.income[index],
    expenses: data.cashFlow.expenses[index],
    profit: data.cashFlow.income[index] - data.cashFlow.expenses[index]
  }));
  
  // Format profit margin data for chart
  const profitMarginData = data.profitMargin.months.map((month, index) => ({
    month,
    value: data.profitMargin.values[index]
  }));
  
  // Format stabulum transactions for chart
  const stabulumData = data.stabulumTransactions.map(item => ({
    date: item.date,
    value: item.type === 'in' ? item.value : -item.value
  }));
  
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  
  const totalIncome = data.cashFlow.income.reduce((a, b) => a + b, 0);
  const totalExpenses = data.cashFlow.expenses.reduce((a, b) => a + b, 0);
  const totalProfit = totalIncome - totalExpenses;
  const profitMargin = (totalProfit / totalIncome * 100).toFixed(1);
  
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
            <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm">
              Export
            </button>
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <StatCard 
            title="Total Revenue" 
            value={formatCurrency(totalIncome)} 
            trend="8.2%" 
            trendDirection="up" 
            icon={DollarSign} 
            color="blue"
          />
          <StatCard 
            title="Total Expenses" 
            value={formatCurrency(totalExpenses)} 
            trend="5.1%" 
            trendDirection="up" 
            icon={BarChart2} 
            color="red"
          />
          <StatCard 
            title="Net Profit" 
            value={formatCurrency(totalProfit)} 
            trend="12.3%" 
            trendDirection="up" 
            icon={TrendingUp} 
            color="green"
          />
          <StatCard 
            title="Profit Margin" 
            value={`${profitMargin}%`} 
            trend="3.5%" 
            trendDirection="up" 
            icon={TrendingUp} 
            color="purple"
          />
        </div>
        
        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
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
                <ComposedChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="income" fill="#3B82F6" />
                  <Bar dataKey="expenses" fill="#EF4444" />
                  <Line type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Account Balances</h2>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.accountBalances}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {data.accountBalances.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        {/* Secondary Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice Status</h2>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.invoiceStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({name, value}) => `${name}: ${value}%`}
                  >
                    {data.invoiceStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between mt-4">
              <button className="text-blue-600 text-sm font-medium">View All Invoices</button>
              <button className="text-blue-600 text-sm font-medium">Create Invoice</button>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Profit Margin</h2>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profitMarginData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis unit="%" />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Area type="monotone" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between mt-4">
              <span className="text-sm text-gray-600">Average: {profitMargin}%</span>
              <button className="text-blue-600 text-sm font-medium">View Report</button>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Stabulum Transactions</h2>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stabulumData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(Math.abs(value))} />
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
        </div>
        
        {/* Bottom Widgets Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Expenses</h2>
            <div className="space-y-4">
              {data.expensesByCategory.slice(0, 5).map((item, index) => (
                <div key={index} className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  ></div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{item.name}</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(item.value)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className="h-1.5 rounded-full" 
                        style={{ 
                          width: `${(item.value / data.expensesByCategory[0].value) * 100}%`,
                          backgroundColor: COLORS[index % COLORS.length]
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <button className="text-blue-600 text-sm font-medium">
                View All Expenses
              </button>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Customers</h2>
            <div className="space-y-4">
              {data.topCustomers.map((customer, index) => (
                <div key={index} className="flex items-center">
                  <div className="bg-gray-100 p-2 rounded-full mr-3">
                    <Users size={16} className="text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-700">{customer.name}</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(customer.value)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <button className="text-blue-600 text-sm font-medium">
                View All Customers
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialDashboard;
