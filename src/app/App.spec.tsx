// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const apiMocks = vi.hoisted(() => ({
  session: vi.fn(),
  logout: vi.fn(),
  overview: vi.fn(),
  releases: vi.fn(),
  config: vi.fn(),
  audits: vi.fn(),
  currentTenant: vi.fn(),
}));

vi.mock("../core/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  authApi: {
    session: apiMocks.session,
    logout: apiMocks.logout,
  },
  adminApi: {
    overview: apiMocks.overview,
    releases: apiMocks.releases,
    config: apiMocks.config,
    audits: apiMocks.audits,
    currentTenant: apiMocks.currentTenant,
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("App sidebar actions", () => {
  it("opens help separately and logs out only from the exit action", async () => {
    apiMocks.session.mockResolvedValue({
      authenticated: true,
      actorId: "admin@example.com",
      expiresAt: null,
      method: "session",
    });
    apiMocks.logout.mockResolvedValue({ authenticated: false });
    apiMocks.currentTenant.mockResolvedValue({
      tenant: {
        id: "tenant-default",
        slug: "default",
        name: "Default tenant",
        status: "active",
        createdAt: "2026-08-25T00:00:00Z",
        updatedAt: "2026-08-25T00:00:00Z",
      },
    });
    apiMocks.releases.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    const help = await screen.findByRole("link", { name: "帮助与规范" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "发布管理" })).toBeTruthy(),
    );
    expect(screen.getByText("Default tenant")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "当前项目" })).toBeNull();
    expect(help.getAttribute("href")).toBe(
      "https://github.com/Helix2010/RN-Admin#readme",
    );
    expect(apiMocks.logout).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "退出管理端" }));
    expect(apiMocks.logout).toHaveBeenCalledTimes(1);
  });
});
