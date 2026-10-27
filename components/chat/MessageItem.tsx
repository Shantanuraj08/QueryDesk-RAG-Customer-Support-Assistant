"use client";

import Image from "next/image";
import { User } from "lucide-react";
import { MessageTurn } from "./types";
import { SourceCard } from "./SourceCard";
import { MessageActions } from "./MessageActions";

interface MessageItemProps {
  turn: MessageTurn;
}

export function MessageItem({ turn }: MessageItemProps) {
  return (
    <div className="space-y-4">
      {/* User Question */}
      <div className="flex justify-end items-start gap-2.5">
        <div className="bg-gray-100 text-gray-800 text-xs sm:text-sm px-4 py-2.5 rounded-2xl max-w-[80%] leading-relaxed">
          {turn.question}
        </div>
        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200/50 flex items-center justify-center text-gray-500 shrink-0 mt-0.5">
          <User size={13} />
        </div>
      </div>

      {/* Assistant Answer */}
      {turn.answer && (
        <div className="flex flex-col items-start max-w-[85%]">
          {/* Header with Netherstar brand icon */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center overflow-hidden shrink-0 bg-white shadow-2xs">
              <Image
                src="/images/netherstar.webp"
                alt="QueryDesk"
                width={16}
                height={16}
                className="w-4 h-4 object-contain"
              />
            </div>
            <span className="text-xs font-semibold text-gray-900">QueryDesk</span>
          </div>

          {/* Response Text */}
          <div className="text-xs sm:text-sm text-gray-800 leading-relaxed pl-8 mt-1.5 whitespace-pre-wrap">
            {turn.answer}
          </div>

          {/* Citations / Source Cards */}
          {turn.citations && turn.citations.length > 0 && (
            <div className="pl-8 w-full">
              <SourceCard citations={turn.citations} />
            </div>
          )}

          {/* Actions: Copy & Thumbs */}
          <div className="pl-8">
            <MessageActions content={turn.answer} />
          </div>
        </div>
      )}
    </div>
  );
}
