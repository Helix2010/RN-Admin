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
  window.history.replaceState(null, "", "/releases");
});

function mockAuthenticatedShell() {
  apiMocks.session.mockResolvedValue({
    authenticated: true,
    actorId: "admin@example.com",
    expiresAt: null,
    method: "session",
  });
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
  apiMocks.overview.mockResolvedValue({
    generatedAt: "2026-08-27T00:00:00Z",
    current: { android: null, ios: null, harmony: null },
    counts: {},
    signals: {
      crashFreeSessions: null,
      updateSuccessRate: null,
      note: "not configured",
    },
  });
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App sidebar actions", () => {
  it("opens help separately and logs out only from the exit action", async () => {
    mockAuthenticatedShell();
    apiMocks.logout.mockResolvedValue({ authenticated: false });
    const user = userEvent.setup();
    renderApp();

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
    expect(window.location.pathname).toBe("/releases");
  });

  it("updates the address and follows browser back navigation", async () => {
    mockAuthenticatedShell();
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: "发布管理" });
    await user.click(screen.getByRole("button", { name: "发布总览" }));
    expect(window.location.pathname).toBe("/dashboard");
    expect(
      await screen.findByRole("heading", { name: "发布总览" }),
    ).toBeTruthy();

    window.history.pushState(null, "", "/releases");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(
      await screen.findByRole("heading", { name: "发布管理" }),
    ).toBeTruthy();
  });

  it("restores the current page from the address after refresh", async () => {
    window.history.replaceState(null, "", "/dashboard");
    mockAuthenticatedShell();
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "发布总览" }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/dashboard");
    expect(
      screen.getByRole("button", { name: "发布总览" }).classList,
    ).toContain("active");
  });

  it("normalizes an unknown address to the default page", async () => {
    window.history.replaceState(null, "", "/unknown-page");
    mockAuthenticatedShell();
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "发布管理" }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/releases");
  });

  it("does not preserve the removed top-level OTA route", async () => {
    window.history.replaceState(null, "", "/ota");
    mockAuthenticatedShell();
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "发布管理" }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/releases");
    expect(window.location.search).toBe("?tab=full");
  });
});
