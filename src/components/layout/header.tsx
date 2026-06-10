"use client";

import { MONTHS } from "@/types";
import type { Profile } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { Bell, Users } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  profile: Profile | null;
  groupName?: string | null;
}

export function Header({ title, subtitle, profile, groupName }: HeaderProps) {
  const now = new Date();
  const monthLabel = MONTHS[now.getMonth() + 1];
  const year = now.getFullYear();

  return (
    <header className="flex items-center justify-between px-5 lg:px-8 py-4 bg-background border-b border-border sticky top-0 z-10">
      <div>
        <div className="flex items-center gap-2.5">
          <h1
            className="font-semibold text-xl text-foreground"
            style={{ fontFamily: "Sora, sans-serif" }}
          >
            {title}
          </h1>
          {groupName && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
              <Users className="h-3 w-3" />
              {groupName}
            </span>
          )}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-sm text-muted-foreground bg-secondary px-3 py-1.5 rounded-full font-medium">
          {monthLabel} {year}
        </span>
        <Avatar className="h-8 w-8 lg:hidden">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs bg-primary text-white">
            {profile?.name ? getInitials(profile.name) : "?"}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
