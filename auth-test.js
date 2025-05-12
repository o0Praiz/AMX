// tests/auth.test.js
const request = require('supertest');
const app = require('../app');
const {
  dbConnect,
  dbDisconnect,
  dbClear,
  initializeTestData,
  authRequest
} = require('./setup');

describe('Authentication API', () => {
  let testData;
  
  beforeAll(async () => {
    await dbConnect();
    testData = await initializeTestData();
  });
  
  afterAll(async () => {
    await dbDisconnect();
  });
  
  afterEach(async () => {
    // Clear any test data that might be created in individual tests
    // but keep the initial setup data
  });
  
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test-admin@example.com',
          password: 'password123'
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
    
    it('should not login with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Invalid credentials');
    });
    
    it('should not login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test-admin@example.com',
          password: 'wrongpassword'
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Invalid credentials');
    });
  });
  
  describe('GET /api/auth/user', () => {
    it('should get user data with valid token', async () => {
      const response = await authRequest(testData.users.admin).get('/api/auth/user');
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('email', testData.users.admin.email);
      expect(response.body).toHaveProperty('firstName', testData.users.admin.firstName);
      expect(response.body).toHaveProperty('lastName', testData.users.admin.lastName);
      expect(response.body).toHaveProperty('role', testData.users.admin.role);
      expect(response.body).not.toHaveProperty('passwordHash');
    });
    
    it('should not get user data without token', async () => {
      const response = await request(app).get('/api/auth/user');
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('No token');
    });
    
    it('should not get user data with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/user')
        .set('x-auth-token', 'invalidtoken');
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Token is not valid');
    });
  });
  
  describe('POST /api/auth/register', () => {
    it('should register new user when admin makes request', async () => {
      const response = await authRequest(testData.users.admin)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'Password123!',
          firstName: 'New',
          lastName: 'User',
          role: 'viewer'
        });
      
      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User created successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'newuser@example.com');
    });
    
    it('should not register new user with existing email', async () => {
      const response = await authRequest(testData.users.admin)
        .post('/api/auth/register')
        .send({
          email: 'test-admin@example.com', // Already exists
          password: 'Password123!',
          firstName: 'Duplicate',
          lastName: 'User',
          role: 'viewer'
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User already exists');
    });
    
    it('should not register new user when non-admin makes request', async () => {
      const response = await authRequest(testData.users.viewer)
        .post('/api/auth/register')
        .send({
          email: 'anotheruser@example.com',
          password: 'Password123!',
          firstName: 'Another',
          lastName: 'User',
          role: 'viewer'
        });
      
      expect(response.statusCode).toBe(403);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Not authorized');
    });
  });
  
  describe('POST /api/auth/change-password', () => {
    it('should change password with valid current password', async () => {
      const response = await authRequest(testData.users.admin)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'password123',
          newPassword: 'NewPassword123!'
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Password updated successfully');
      
      // Verify login with new password works
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.users.admin.email,
          password: 'NewPassword123!'
        });
      
      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.body).toHaveProperty('token');
    });
    
    it('should not change password with invalid current password', async () => {
      const response = await authRequest(testData.users.accountant)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewPassword123!'
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Current password is incorrect');
    });
  });
});
