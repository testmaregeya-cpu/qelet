import {
  checkIsPlatformAdmin,
  fetchPlatformMetrics,
  fetchPlatformUsers,
  fetchPlatformHouseholds,
  banPlatformUser,
  unbanPlatformUser,
} from '../src/services/platformAdmin';

const mockRpc = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  getSupabaseClient: () => ({
    rpc: mockRpc,
  }),
}));

describe('platformAdmin service', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('checkIsPlatformAdmin returns boolean from RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const isAdmin = await checkIsPlatformAdmin();
    expect(isAdmin).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('check_is_platform_admin');

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Unauthorized' } });
    const isNotAdmin = await checkIsPlatformAdmin();
    expect(isNotAdmin).toBe(false);
  });

  it('fetchPlatformMetrics returns metrics object', async () => {
    const mockMetrics = {
      total_households: 5,
      total_users: 12,
      total_shops: 8,
      gross_credit_santim: 500000,
      gross_payments_santim: 200000,
      total_banned_users: 0,
    };
    mockRpc.mockResolvedValueOnce({ data: mockMetrics, error: null });

    const metrics = await fetchPlatformMetrics();
    expect(metrics.total_households).toBe(5);
    expect(metrics.gross_credit_santim).toBe(500000);
    expect(mockRpc).toHaveBeenCalledWith('get_platform_metrics');
  });

  it('fetchPlatformUsers and fetchPlatformHouseholds return lists', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ user_id: 'u1', email: 'test@example.com', is_banned: false }],
      error: null,
    });
    const users = await fetchPlatformUsers();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('test@example.com');

    mockRpc.mockResolvedValueOnce({
      data: [{ household_id: 'h1', household_name: 'Test Household' }],
      error: null,
    });
    const households = await fetchPlatformHouseholds();
    expect(households).toHaveLength(1);
    expect(households[0].household_name).toBe('Test Household');
  });

  it('banPlatformUser and unbanPlatformUser call respective RPCs', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await banPlatformUser('target-user-1', 'Spamming entries');
    expect(mockRpc).toHaveBeenCalledWith('ban_platform_user', {
      p_target_user_id: 'target-user-1',
      p_reason: 'Spamming entries',
    });

    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await unbanPlatformUser('target-user-1');
    expect(mockRpc).toHaveBeenCalledWith('unban_platform_user', {
      p_target_user_id: 'target-user-1',
    });
  });
});
