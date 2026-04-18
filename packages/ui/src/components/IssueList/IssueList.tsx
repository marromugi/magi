import type { Issue, IssueStatus } from "../../types";

const STATUS_CLASSES: Record<IssueStatus, string> = {
  queue: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
};

interface Props {
  issues: Issue[];
  onSelectIssue?: (id: number) => void;
}

export function IssueList({ issues, onSelectIssue }: Props) {
  if (issues.length === 0) {
    return <p className="text-gray-500 text-center py-8">No issues found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {["ID", "Title", "Type", "Priority", "Status", "Depends On"].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {issues.map((issue) => {
            const deps: number[] = JSON.parse(issue.depends_on || "[]");
            return (
              <tr key={issue.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">{issue.id}</td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {issue.title}
                </td>
                <td className="px-4 py-3 text-sm font-mono">{issue.type}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {issue.priority}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    data-testid="status-badge"
                    data-status={issue.status}
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[issue.status]}`}
                  >
                    {issue.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="flex gap-1 flex-wrap">
                    {deps.map((depId) => (
                      <a
                        key={depId}
                        href={`#${depId}`}
                        onClick={(e) => {
                          e.preventDefault();
                          onSelectIssue?.(depId);
                        }}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        #{depId}
                      </a>
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
