-- 生日改成「註冊當下決定，之後不可自行修改」。
--
-- 原本的規則是「填過就鎖」（202609040036），所以註冊時沒填的人，日後還能在
-- 會員中心補填一次。那一次補填就是漏洞：註冊完把生日填成當月，當月就能領
-- 生日公益存款。2026-10-08 店主決定收掉這個補填的機會。
--
-- 改動只有一處：判斷條件從「原本已經有值」放寬成「這次 UPDATE 改到了生日」，
-- 於是 NULL → 有值 也會被擋。註冊時的寫入走的是 INSERT（copy_birthday_from_signup），
-- 不經過這個 before update trigger，所以註冊照常。
--
-- 後台（service_role）與 SQL Editor 仍然放行 —— 客人填錯要更正時，客服改得動。
-- 這是刻意保留的，不是漏網：鎖的是「會員自己改」，不是「這個欄位不能動」。
create or replace function public.lock_birthday_once()
returns trigger
language plpgsql
as $$
begin
  if new.birthday is distinct from old.birthday
     and coalesce(auth.role(), 'service_role') = 'authenticated' then
    raise exception '生日於註冊時設定後不可修改，如需更正請聯絡客服'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- trigger 本身不用重建（還是 before update on user_profiles），函式換掉即可。
