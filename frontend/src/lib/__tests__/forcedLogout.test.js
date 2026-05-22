jest.mock("../api", () => ({
  api: { defaults: { headers: { common: {} } } },
  clearAuthSession: jest.fn(),
  getStoredAccessToken: jest.fn(),
}));

jest.mock("../logoutFlow", () => ({
  executeLogout: jest.fn(),
  getForceLogoutMessage: jest.fn(),
  consumeForceLogoutPending: jest.fn(),
}));

jest.mock("../logoutCleanup", () => ({
  runLoggedOutNotificationGuard: jest.fn(),
}));

jest.mock("../activeConversationStorage", () => ({
  clearStoredActiveConversationId: jest.fn(),
}));

import {
  get401LogoutReason,
  LOGOUT_REASON_ANOTHER_DEVICE,
} from "../forcedLogout";

describe("forcedLogout", () => {
  test("detects another-device logout from 401 detail string", () => {
    const err = {
      response: { status: 401, data: { detail: LOGOUT_REASON_ANOTHER_DEVICE } },
    };
    expect(get401LogoutReason(err)).toBe(LOGOUT_REASON_ANOTHER_DEVICE);
  });

  test("detects object detail code", () => {
    const err = {
      response: {
        status: 401,
        data: { detail: { code: LOGOUT_REASON_ANOTHER_DEVICE } },
      },
    };
    expect(get401LogoutReason(err)).toBe(LOGOUT_REASON_ANOTHER_DEVICE);
  });

  test("returns null for non-401", () => {
    expect(get401LogoutReason({ response: { status: 403 } })).toBeNull();
  });
});
