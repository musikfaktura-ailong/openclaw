import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const heartbeatRunner = {
    stop: vi.fn(),
    updateConfig: vi.fn(),
  };
  const autonomyBridge = {
    stop: vi.fn(),
    updateConfig: vi.fn(),
  };
  return {
    heartbeatRunner,
    autonomyBridge,
    startHeartbeatRunner: vi.fn(() => heartbeatRunner),
    startStewardAutonomyBridge: vi.fn(() => autonomyBridge),
    startChannelHealthMonitor: vi.fn(() => ({ stop: vi.fn() })),
    startGatewayModelPricingRefresh: vi.fn(() => vi.fn()),
    recoverPendingDeliveries: vi.fn(async () => undefined),
    deliverOutboundPayloads: vi.fn(),
  };
});

vi.mock("../infra/heartbeat-runner.js", () => ({
  startHeartbeatRunner: hoisted.startHeartbeatRunner,
}));

vi.mock("../steward/autonomy/autonomy-bridge.js", () => ({
  startStewardAutonomyBridge: hoisted.startStewardAutonomyBridge,
}));

vi.mock("../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: hoisted.deliverOutboundPayloads,
}));

vi.mock("../infra/outbound/delivery-queue.js", () => ({
  recoverPendingDeliveries: hoisted.recoverPendingDeliveries,
}));

vi.mock("./channel-health-monitor.js", () => ({
  startChannelHealthMonitor: hoisted.startChannelHealthMonitor,
}));

vi.mock("./model-pricing-cache.js", () => ({
  startGatewayModelPricingRefresh: hoisted.startGatewayModelPricingRefresh,
}));

const { activateGatewayScheduledServices, startGatewayRuntimeServices } =
  await import("./server-runtime-services.js");

describe("server-runtime-services", () => {
  beforeEach(() => {
    vi.useRealTimers();
    hoisted.heartbeatRunner.stop.mockClear();
    hoisted.heartbeatRunner.updateConfig.mockClear();
    hoisted.autonomyBridge.stop.mockClear();
    hoisted.autonomyBridge.updateConfig.mockClear();
    hoisted.startHeartbeatRunner.mockClear();
    hoisted.startStewardAutonomyBridge.mockClear();
    hoisted.startChannelHealthMonitor.mockClear();
    hoisted.startGatewayModelPricingRefresh.mockClear();
    hoisted.recoverPendingDeliveries.mockClear();
    hoisted.deliverOutboundPayloads.mockClear();
  });

  it("keeps scheduled services inert during initial runtime setup", () => {
    const services = startGatewayRuntimeServices({
      minimalTestGateway: false,
      cfgAtStart: {} as never,
      channelManager: {
        getRuntimeSnapshot: vi.fn(),
        isHealthMonitorEnabled: vi.fn(),
        isManuallyStopped: vi.fn(),
      } as never,
      log: createLog(),
    });

    expect(hoisted.startChannelHealthMonitor).toHaveBeenCalledTimes(1);
    expect(hoisted.startHeartbeatRunner).not.toHaveBeenCalled();
    expect(hoisted.startStewardAutonomyBridge).not.toHaveBeenCalled();
    expect(hoisted.recoverPendingDeliveries).not.toHaveBeenCalled();

    services.heartbeatRunner.stop();
    expect(hoisted.heartbeatRunner.stop).not.toHaveBeenCalled();
    services.autonomyBridge.stop();
    expect(hoisted.autonomyBridge.stop).not.toHaveBeenCalled();
  });

  it("activates heartbeat, cron, and delivery recovery after sidecars are ready", async () => {
    const cron = { start: vi.fn(async () => undefined) };
    const log = createLog();
    const cfg = {
      session: {
        store: "/tmp/gateway-sessions.json",
      },
    } as never;

    const services = activateGatewayScheduledServices({
      minimalTestGateway: false,
      cfgAtStart: cfg,
      cron,
      logCron: { error: vi.fn() },
      log,
    });

    expect(hoisted.startHeartbeatRunner).toHaveBeenCalledTimes(1);
    expect(hoisted.startStewardAutonomyBridge).toHaveBeenCalledTimes(1);
    expect(hoisted.startStewardAutonomyBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg,
      }),
    );
    expect(cron.start).toHaveBeenCalledTimes(1);
    expect(services.heartbeatRunner).toBe(hoisted.heartbeatRunner);
    expect(services.autonomyBridge).toBe(hoisted.autonomyBridge);
    await vi.dynamicImportSettled();
    expect(hoisted.recoverPendingDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        deliver: hoisted.deliverOutboundPayloads,
        cfg,
      }),
    );
  });

  it("keeps scheduled services disabled for minimal test gateways", () => {
    const cron = { start: vi.fn(async () => undefined) };

    const services = activateGatewayScheduledServices({
      minimalTestGateway: true,
      cfgAtStart: {} as never,
      cron,
      logCron: { error: vi.fn() },
      log: createLog(),
    });

    expect(hoisted.startHeartbeatRunner).not.toHaveBeenCalled();
    expect(hoisted.startStewardAutonomyBridge).not.toHaveBeenCalled();
    expect(cron.start).not.toHaveBeenCalled();
    expect(hoisted.recoverPendingDeliveries).not.toHaveBeenCalled();

    services.heartbeatRunner.stop();
    expect(hoisted.heartbeatRunner.stop).not.toHaveBeenCalled();
    services.autonomyBridge.stop();
    expect(hoisted.autonomyBridge.stop).not.toHaveBeenCalled();
  });
});

function createLog() {
  return {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    error: vi.fn(),
  };
}
