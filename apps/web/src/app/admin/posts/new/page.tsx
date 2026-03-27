"use client"

import { PostForm } from "../_components/PostForm"

export default function NewPostPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-[#10305a] mb-6">新增文章</h1>
      <PostForm mode="create" />
    </div>
  )
}
