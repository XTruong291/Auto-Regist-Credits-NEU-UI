import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  LogOut,
  Play,
  RefreshCw,
  ShieldCheck,
  StopCircle,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_STORAGE_KEY = "neu_token";
const USER_STORAGE_KEY = "neu_username";

type JobStatus =
  | "QUEUED"
  | "CAMPING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT"
  | string;

type Job = {
  job_id: string;
  status: JobStatus;
  result: Record<string, unknown>;
  error: string | null;
  course_ids: string[];
  target_timestamp: number;
  created_at: string;
  updated_at: string;
};

type JobEvent = {
  event_id: string;
  job_id: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type LoginResponse = {
  neu_token: string;
  token_type: string;
  neu_username: string;
};

function formatDate(value: string | number) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("vi-VN", { hour12: false });
}

function statusClass(status: JobStatus) {
  return `status status-${status.toLowerCase()}`;
}

function splitCourseIds(input: string) {
  return input
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function parseApiError(response: Response) {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
    return JSON.stringify(data.detail || data);
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [neuUsername, setNeuUsername] = useState(() => sessionStorage.getItem(USER_STORAGE_KEY) || "");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registType, setRegistType] = useState("NKH");
  const [courseInput, setCourseInput] = useState("");
  const [targetTimestamp, setTargetTimestamp] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [driftSeconds, setDriftSeconds] = useState("-30.361");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  const isLoggedIn = Boolean(token);

  const setNotice = (nextMessage: string) => {
    setMessage(nextMessage);
    setError("");
  };

  const setProblem = (nextError: string) => {
    setError(nextError);
    setMessage("");
  };

  const clearSessionState = useCallback((notice?: string) => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(USER_STORAGE_KEY);
    setToken("");
    setNeuUsername("");
    setJobs([]);
    setEvents([]);
    setSelectedJob(null);
    setSelectedJobId("");
    if (notice) {
      setError(notice);
      setMessage("");
    }
  }, []);

  const apiFetch = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const headers = new Headers(options.headers);
      if (token) headers.set("Authorization", authHeaders.Authorization);

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const message = await parseApiError(response);
        if (response.status === 401) {
          clearSessionState("Token NEU không còn hợp lệ. Vui lòng đăng nhập lại.");
        }
        throw new Error(message);
      }

      if (response.status === 204) return undefined as T;
      return response.json() as Promise<T>;
    },
    [authHeaders, clearSessionState, token],
  );

  const loadJobs = useCallback(async () => {
    if (!token) return;
    setJobsLoading(true);
    try {
      const data = await apiFetch<Job[]>("/jobs");
      setJobs(data);
      if (!selectedJobId && data.length > 0) setSelectedJobId(data[0].job_id);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Không tải được danh sách job");
    } finally {
      setJobsLoading(false);
    }
  }, [apiFetch, selectedJobId, token]);

  const loadSelectedJob = useCallback(async () => {
    if (!token || !selectedJobId) return;
    try {
      const data = await apiFetch<Job>(`/jobs/${selectedJobId}`);
      setSelectedJob(data);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Không tải được chi tiết job");
    }
  }, [apiFetch, selectedJobId, token]);

  const loadEvents = useCallback(async () => {
    if (!token || !selectedJobId) return;
    setEventsLoading(true);
    try {
      const data = await apiFetch<JobEvent[]>(`/jobs/${selectedJobId}/events`);
      setEvents(data);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Không tải được event");
    } finally {
      setEventsLoading(false);
    }
  }, [apiFetch, selectedJobId, token]);

  useEffect(() => {
    if (!token) return;
    loadJobs();
    const interval = window.setInterval(loadJobs, 3000);
    return () => window.clearInterval(interval);
  }, [loadJobs, token]);

  useEffect(() => {
    if (!token || !selectedJobId) {
      setSelectedJob(null);
      setEvents([]);
      return;
    }
    loadSelectedJob();
    loadEvents();
    const interval = window.setInterval(() => {
      loadSelectedJob();
      loadEvents();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [loadEvents, loadSelectedJob, selectedJobId, token]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/neu/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          neu_username: loginUsername.trim(),
          neu_password: loginPassword,
        }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));

      const data = (await response.json()) as LoginResponse;
      sessionStorage.setItem(TOKEN_STORAGE_KEY, data.neu_token);
      sessionStorage.setItem(USER_STORAGE_KEY, data.neu_username);
      setToken(data.neu_token);
      setNeuUsername(data.neu_username);
      setLoginPassword("");
      setNotice("Đăng nhập NEU thành công");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function handleTimestamp(event: FormEvent) {
    event.preventDefault();
    if (!targetDate.trim()) {
      setProblem("Nhập thời gian mục tiêu theo dạng YYYY-MM-DD HH:mm:ss");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        target_str: targetDate.trim(),
        drift_seconds: driftSeconds || "0",
      });
      const data = await apiFetch<Record<string, unknown>>(`/utils/generate-timestamp?${params.toString()}`);
      setTargetTimestamp(String(data["4_FINAL_TIMESTAMP"] || ""));
      setNotice("Đã tính timestamp");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Không tính được timestamp");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateJob(event: FormEvent) {
    event.preventDefault();
    const courseIds = splitCourseIds(courseInput);
    const timestamp = Number(targetTimestamp);
    if (!token) {
      setProblem("Bạn cần đăng nhập NEU trước");
      return;
    }
    if (courseIds.length === 0) {
      setProblem("Nhập ít nhất một mã lớp");
      return;
    }
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      setProblem("Timestamp phải là số lớn hơn 0");
      return;
    }

    setLoading(true);
    try {
      const created = await apiFetch<{ job_id: string }>("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regist_type: registType.trim() || "NKH",
          course_ids: courseIds,
          target_timestamp: timestamp,
        }),
      });
      setSelectedJobId(created.job_id);
      setNotice("Đã tạo job");
      await loadJobs();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Tạo job thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelJob(jobId: string) {
    setLoading(true);
    try {
      await apiFetch(`/jobs/${jobId}`, { method: "DELETE" });
      setNotice("Đã gửi yêu cầu hủy job");
      await loadJobs();
      await loadSelectedJob();
      await loadEvents();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Hủy job thất bại");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearSessionState();
    setNotice("Đã đăng xuất khỏi giao diện");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>NEU Registration Console</h1>
          <p>This is just MVP so if you find any issues, please let me know</p>
          <a href="https://www.linkedin.com/in/nguy%E1%BB%85n-tr%C6%B0%E1%BB%9Dng-b90577361/" target="_blank" rel="noopener noreferrer">
            Report an issue
          </a>
        </div>
        <div className="session-pill">
          <ShieldCheck size={18} />
          <span>{isLoggedIn ? neuUsername || "Đã đăng nhập" : "Chưa đăng nhập"}</span>
          {isLoggedIn && (
            <button className="icon-button" onClick={handleLogout} title="Đăng xuất">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      {(message || error) && (
        <div className={error ? "notice notice-error" : "notice notice-success"}>
          {error ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
          <span>{error || message}</span>
        </div>
      )}

      <main className="layout">
        <aside className="control-panel">
          <section className="panel">
            <div className="panel-heading">
              <ShieldCheck size={18} />
              <h2>Đăng nhập NEU</h2>
            </div>
            <form onSubmit={handleLogin} className="form-grid">
              <label>
                Tài khoản NEU
                <input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} />
              </label>
              <label>
                Mật khẩu NEU
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>
              <button className="primary-button" type="submit" disabled={loading}>
                <ShieldCheck size={18} />
                Đăng nhập
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <CalendarClock size={18} />
              <h2>Tính timestamp</h2>
            </div>
            <form onSubmit={handleTimestamp} className="form-grid">
              <label>
                Giờ VN
                <input
                  placeholder="2026-06-04 08:00:00"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                />
              </label>
              <label>
                Drift giây
                <input value={driftSeconds} onChange={(event) => setDriftSeconds(event.target.value)} />
              </label>
              <button className="secondary-button" type="submit" disabled={loading}>
                <CalendarClock size={18} />
                Tính
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <Play size={18} />
              <h2>Tạo job</h2>
            </div>
            <form onSubmit={handleCreateJob} className="form-grid">
              <label>
                Regist type
                <input value={registType} onChange={(event) => setRegistType(event.target.value)} />
              </label>
              <label>
                Course IDs
                <textarea
                  rows={4}
                  placeholder="LLNL1106(325)_02"
                  value={courseInput}
                  onChange={(event) => setCourseInput(event.target.value)}
                />
              </label>
              <label>
                Target timestamp
                <input value={targetTimestamp} onChange={(event) => setTargetTimestamp(event.target.value)} />
              </label>
              <button className="primary-button" type="submit" disabled={!isLoggedIn || loading}>
                <Play size={18} />
                Tạo job
              </button>
            </form>
          </section>
        </aside>

        <section className="workspace">
          <section className="panel jobs-panel">
            <div className="panel-heading panel-heading-actions">
              <div>
                <ClipboardList size={18} />
                <h2>Jobs</h2>
              </div>
              <button className="icon-text-button" onClick={loadJobs} disabled={!isLoggedIn || jobsLoading}>
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Course IDs</th>
                    <th>Target</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr
                      key={job.job_id}
                      className={selectedJobId === job.job_id ? "selected-row" : ""}
                      onClick={() => setSelectedJobId(job.job_id)}
                    >
                      <td>
                        <span className={statusClass(job.status)}>{job.status}</span>
                      </td>
                      <td>{job.course_ids.join(", ")}</td>
                      <td>{formatDate(job.target_timestamp)}</td>
                      <td>{formatDate(job.updated_at)}</td>
                      <td>
                        <button
                          className="icon-button danger"
                          title="Hủy job"
                          disabled={loading || !["QUEUED", "CAMPING", "RUNNING"].includes(job.status)}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCancelJob(job.job_id);
                          }}
                        >
                          <StopCircle size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-cell">
                        {isLoggedIn ? "Chưa có job" : "Đăng nhập để tải danh sách job"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="detail-grid">
            <div className="panel">
              <div className="panel-heading">
                <ClipboardList size={18} />
                <h2>Job detail</h2>
              </div>
              {selectedJob ? (
                <div className="detail-list">
                  <div>
                    <span>Job ID</span>
                    <strong>{selectedJob.job_id}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong className={statusClass(selectedJob.status)}>{selectedJob.status}</strong>
                  </div>
                  <div>
                    <span>Error</span>
                    <strong>{selectedJob.error || "-"}</strong>
                  </div>
                  <div>
                    <span>Result</span>
                    <pre>{JSON.stringify(selectedJob.result || {}, null, 2)}</pre>
                  </div>
                </div>
              ) : (
                <div className="empty-panel">Chọn một job để xem chi tiết</div>
              )}
            </div>

            <div className="panel events-panel">
              <div className="panel-heading panel-heading-actions">
                <div>
                  <RefreshCw size={18} />
                  <h2>Events</h2>
                </div>
                <span className="muted">{eventsLoading ? "Đang tải..." : `${events.length} event`}</span>
              </div>
              <div className="event-list">
                {events.map((event) => (
                  <article key={event.event_id} className="event-item">
                    <div>
                      <strong>{event.event_type}</strong>
                      <time>{formatDate(event.created_at)}</time>
                    </div>
                    <p>{event.message}</p>
                    {Object.keys(event.metadata || {}).length > 0 && (
                      <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                    )}
                  </article>
                ))}
                {events.length === 0 && <div className="empty-panel">Chưa có event</div>}
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
