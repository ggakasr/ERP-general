"use client"

import { useERPStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AdminPage() {
  const { users, branches, departments } = useERPStore()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Quan tri he thong (System Admin)</h1>
        <p className="text-muted-foreground">Quan ly nguoi dung, phan quyen, cau hinh he thong</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Nguoi dung</p><p className="text-2xl font-bold">{users.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Chi nhanh</p><p className="text-2xl font-bold">{branches.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Phong ban</p><p className="text-2xl font-bold">{departments.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Danh ba nguoi dung (BM-01)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ma NV</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ho ten</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Chuc vu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Vai tro</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Trang thai</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-mono">{user.employeeCode}</td>
                    <td className="px-4 py-3 text-sm font-medium">{user.fullName}</td>
                    <td className="px-4 py-3 text-sm">{user.email}</td>
                    <td className="px-4 py-3 text-sm">{user.position}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <span key={role} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{role}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                        {user.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Chi nhanh</CardTitle></CardHeader>
          <CardContent>
            {branches.map((branch) => (
              <div key={branch.id} className="flex items-center justify-between border-b py-2 last:border-0">
                <span className="font-medium">{branch.name}</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{branch.code}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Phong ban</CardTitle></CardHeader>
          <CardContent>
            {departments.map((dept) => (
              <div key={dept.id} className="flex items-center justify-between border-b py-2 last:border-0">
                <span className="font-medium">{dept.name}</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{dept.code}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Ma tran phan quyen 3 tang (BM-12)</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border p-4 text-sm">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-blue-50 p-3">
                <h4 className="font-semibold text-blue-800 mb-1">Tang 1: Hanh dong</h4>
                <p className="text-blue-600 text-xs">VIEW, CREATE, EDIT, DELETE, APPROVE, EXPORT</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <h4 className="font-semibold text-green-800 mb-1">Tang 2: Pham vi du lieu</h4>
                <p className="text-green-600 text-xs">OWN, DEPARTMENT, BRANCH, COMPANY</p>
              </div>
              <div className="rounded-lg bg-purple-50 p-3">
                <h4 className="font-semibold text-purple-800 mb-1">Tang 3: Truong du lieu</h4>
                <p className="text-purple-600 text-xs">Visible fields, Editable fields, Hidden fields</p>
              </div>
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              Permission = Role x Data Scope x Field Level (NT5)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
