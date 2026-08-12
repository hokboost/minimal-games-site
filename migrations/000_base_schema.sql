--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14 (Debian 16.14-1.pgdg12+1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path = public;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--



--
-- Name: reject_balance_log_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_balance_log_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'balance_logs is append-only';
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_sessions (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    session_id character varying(255) NOT NULL,
    ip_address inet NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    last_activity timestamp with time zone DEFAULT now(),
    terminated_at timestamp with time zone,
    termination_reason character varying(100),
    is_active boolean DEFAULT true
);


--
-- Name: active_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.active_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: active_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.active_sessions_id_seq OWNED BY public.active_sessions.id;


--
-- Name: api_request_nonces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_request_nonces (
    nonce character varying(200) NOT NULL,
    request_method character varying(10) NOT NULL,
    request_path text NOT NULL,
    request_timestamp timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: availability_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability_blocks (
    id integer NOT NULL,
    admin_username text NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: availability_blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.availability_blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: availability_blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.availability_blocks_id_seq OWNED BY public.availability_blocks.id;


--
-- Name: balance_audit_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_audit_baselines (
    version character varying(50) NOT NULL,
    username character varying(255) NOT NULL,
    balance numeric NOT NULL,
    last_balance_log_id bigint NOT NULL,
    established_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT balance_audit_baselines_balance_check CHECK ((balance >= (0)::numeric))
);


--
-- Name: balance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_logs (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    operation_type character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    balance_before numeric(10,2) NOT NULL,
    balance_after numeric(10,2) NOT NULL,
    description text,
    game_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address inet,
    user_agent text,
    request_id character varying(200)
);


--
-- Name: balance_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_logs_id_seq OWNED BY public.balance_logs.id;


--
-- Name: blindbox_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blindbox_logs (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    tier_key character varying(50) NOT NULL,
    tier_name character varying(100) NOT NULL,
    box_count integer NOT NULL,
    total_cost integer NOT NULL,
    total_reward_value integer NOT NULL,
    rewards jsonb NOT NULL,
    batch_id character varying(32),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blindbox_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blindbox_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blindbox_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blindbox_logs_id_seq OWNED BY public.blindbox_logs.id;


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id integer NOT NULL,
    username text NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bookings_id_seq OWNED BY public.bookings.id;


--
-- Name: dictation_allowances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dictation_allowances (
    username character varying(100) NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dictation_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dictation_progress (
    username character varying(100) NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    set_id integer,
    session_id integer
);


--
-- Name: dictation_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dictation_sessions (
    id integer NOT NULL,
    username character varying(100),
    set_id integer NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    result character varying(20) DEFAULT 'in_progress'::character varying NOT NULL
);


--
-- Name: dictation_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dictation_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dictation_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dictation_sessions_id_seq OWNED BY public.dictation_sessions.id;


--
-- Name: dictation_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dictation_submissions (
    id integer NOT NULL,
    user_id integer,
    username character varying(100),
    word_id text NOT NULL,
    word text,
    pronunciation text,
    definition text,
    user_input text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    level integer DEFAULT 1,
    image_path text,
    set_id integer,
    session_id integer,
    admin_message text
);


--
-- Name: dictation_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dictation_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dictation_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dictation_submissions_id_seq OWNED BY public.dictation_submissions.id;


--
-- Name: duel_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duel_logs (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    gift_type character varying(50) NOT NULL,
    reward integer DEFAULT 0 NOT NULL,
    power integer NOT NULL,
    cost integer NOT NULL,
    success boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text)
);


--
-- Name: duel_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.duel_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: duel_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.duel_logs_id_seq OWNED BY public.duel_logs.id;


--
-- Name: financial_audit_cutovers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_audit_cutovers (
    version character varying(50) NOT NULL,
    established_at timestamp with time zone DEFAULT now() NOT NULL,
    last_balance_log_id bigint NOT NULL,
    user_count integer NOT NULL,
    legacy_arithmetic_mismatches integer NOT NULL,
    notes text NOT NULL
);


--
-- Name: flip_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flip_logs (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    action_type character varying(20) NOT NULL,
    cost integer DEFAULT 0 NOT NULL,
    reward integer DEFAULT 0 NOT NULL,
    card_index integer,
    card_type character varying(10),
    good_count integer DEFAULT 0 NOT NULL,
    bad_count integer DEFAULT 0 NOT NULL,
    ended boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text)
);


--
-- Name: flip_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.flip_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: flip_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.flip_logs_id_seq OWNED BY public.flip_logs.id;


--
-- Name: flip_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flip_states (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    board jsonb DEFAULT '[]'::jsonb NOT NULL,
    flipped jsonb DEFAULT '[]'::jsonb NOT NULL,
    good_count integer DEFAULT 0 NOT NULL,
    bad_count integer DEFAULT 0 NOT NULL,
    ended boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text),
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text)
);


--
-- Name: flip_states_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.flip_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: flip_states_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.flip_states_id_seq OWNED BY public.flip_states.id;


--
-- Name: gift_exchanges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_exchanges (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    gift_type character varying(50) NOT NULL,
    gift_name character varying(100) NOT NULL,
    cost integer NOT NULL,
    status character varying(20) DEFAULT 'completed'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    bilibili_room_id character varying(50),
    bilibili_uid character varying(50),
    delivery_status character varying(20) DEFAULT 'pending'::character varying,
    quantity integer DEFAULT 1,
    failure_reason text,
    idempotency_key character varying(100),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: gift_exchanges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gift_exchanges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gift_exchanges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gift_exchanges_id_seq OWNED BY public.gift_exchanges.id;


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    id integer NOT NULL,
    username text NOT NULL,
    idempotency_key text NOT NULL,
    request_method text NOT NULL,
    request_path text NOT NULL,
    request_hash text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    response_status integer,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_reason text,
    CONSTRAINT idempotency_keys_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'indeterminate'::text])))
);


--
-- Name: idempotency_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.idempotency_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: idempotency_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.idempotency_keys_id_seq OWNED BY public.idempotency_keys.id;


--
-- Name: ip_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_activities (
    id integer NOT NULL,
    ip_address inet NOT NULL,
    username character varying(50),
    user_agent text,
    action character varying(50) DEFAULT 'access'::character varying,
    location_country character varying(100),
    location_city character varying(100),
    location_region character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ip_activities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ip_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ip_activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ip_activities_id_seq OWNED BY public.ip_activities.id;


--
-- Name: ip_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_blacklist (
    id integer NOT NULL,
    ip_address inet NOT NULL,
    reason text NOT NULL,
    added_by character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


--
-- Name: ip_blacklist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ip_blacklist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ip_blacklist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ip_blacklist_id_seq OWNED BY public.ip_blacklist.id;


--
-- Name: ip_whitelist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_whitelist (
    id integer NOT NULL,
    ip_address inet NOT NULL,
    reason text NOT NULL,
    added_by character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


--
-- Name: ip_whitelist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ip_whitelist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ip_whitelist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ip_whitelist_id_seq OWNED BY public.ip_whitelist.id;


--
-- Name: login_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_logs (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    ip_address inet NOT NULL,
    user_agent text,
    login_result character varying(20) NOT NULL,
    failure_reason text,
    location_country character varying(100),
    location_city character varying(100),
    risk_score integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: login_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_logs_id_seq OWNED BY public.login_logs.id;


--
-- Name: pk_gift_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pk_gift_logs (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    room_id character varying(50),
    gift_ids jsonb NOT NULL,
    script_name character varying(50),
    success boolean,
    reason text,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text),
    ticket_count integer,
    report_id character varying(128)
);


--
-- Name: pk_gift_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pk_gift_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pk_gift_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pk_gift_logs_id_seq OWNED BY public.pk_gift_logs.id;


--
-- Name: pk_runner_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pk_runner_state (
    username character varying(50) NOT NULL,
    room_id character varying(50),
    running boolean DEFAULT false,
    pid integer,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text)
);


--
-- Name: pk_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pk_tasks (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    room_id character varying(50),
    action character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    error text,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text),
    processed_at timestamp without time zone
);


--
-- Name: pk_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pk_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pk_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pk_tasks_id_seq OWNED BY public.pk_tasks.id;


--
-- Name: quiz_question_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_question_tokens (
    token text NOT NULL,
    session_id text NOT NULL,
    question_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone
);


--
-- Name: quiz_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_sessions (
    id text NOT NULL,
    username character varying(50) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    settled_at timestamp with time zone,
    CONSTRAINT quiz_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'settled'::text, 'expired'::text, 'replaced'::text])))
);


--
-- Name: scratch_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scratch_results (
    id integer NOT NULL,
    username text NOT NULL,
    winning_numbers jsonb NOT NULL,
    slots jsonb NOT NULL,
    reward text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    proof text NOT NULL,
    reward_list jsonb,
    tier_cost integer,
    tier_config jsonb,
    balance_before bigint,
    balance_after bigint,
    matches_count integer DEFAULT 0,
    game_details jsonb
);


--
-- Name: scratch_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scratch_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scratch_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scratch_results_id_seq OWNED BY public.scratch_results.id;


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_events (
    id integer NOT NULL,
    event_type character varying(50) NOT NULL,
    username character varying(50),
    ip_address inet,
    description text,
    severity character varying(20) DEFAULT 'medium'::character varying,
    handled boolean DEFAULT false,
    handled_by character varying(50),
    handled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: security_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_events_id_seq OWNED BY public.security_events.id;


--
-- Name: slot_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slot_results (
    id integer NOT NULL,
    username text NOT NULL,
    result jsonb NOT NULL,
    won text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    proof text NOT NULL,
    bet_amount integer DEFAULT 1,
    payout_amount integer DEFAULT 0,
    balance_before bigint,
    balance_after bigint,
    multiplier numeric(3,2),
    game_details jsonb
);


--
-- Name: slot_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.slot_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: slot_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.slot_results_id_seq OWNED BY public.slot_results.id;


--
-- Name: spin_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spin_results (
    id integer NOT NULL,
    username text NOT NULL,
    prize text NOT NULL,
    angle double precision NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reward_amount integer DEFAULT 0,
    balance_before numeric,
    balance_after numeric
);


--
-- Name: spin_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spin_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spin_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spin_results_id_seq OWNED BY public.spin_results.id;


--
-- Name: stone_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stone_logs (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    action_type character varying(20) NOT NULL,
    cost integer DEFAULT 0 NOT NULL,
    reward integer DEFAULT 0 NOT NULL,
    slot_index integer,
    before_slots jsonb DEFAULT '[]'::jsonb NOT NULL,
    after_slots jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text)
);


--
-- Name: stone_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stone_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stone_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stone_logs_id_seq OWNED BY public.stone_logs.id;


--
-- Name: stone_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stone_states (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    slots jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text),
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text)
);


--
-- Name: stone_states_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stone_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stone_states_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stone_states_id_seq OWNED BY public.stone_states.id;


--
-- Name: submission_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submission_details (
    id integer NOT NULL,
    submission_id integer,
    question_id integer,
    user_answer text,
    is_correct boolean,
    correct_answer text
);


--
-- Name: submission_details_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.submission_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: submission_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.submission_details_id_seq OWNED BY public.submission_details.id;


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id integer NOT NULL,
    username text,
    score integer,
    submitted_at text,
    proof text
);


--
-- Name: submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.submissions_id_seq OWNED BY public.submissions.id;


--
-- Name: user_coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_coupons (
    id integer NOT NULL,
    username text NOT NULL,
    coupon_type text NOT NULL,
    hours integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'unused'::text NOT NULL,
    exchange_cost integer DEFAULT 10000 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: user_coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_coupons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_coupons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_coupons_id_seq OWNED BY public.user_coupons.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    spins_allowed integer DEFAULT 0,
    authorized boolean DEFAULT false,
    is_admin boolean DEFAULT false,
    login_failures integer DEFAULT 0,
    last_failure_time timestamp without time zone,
    locked_until timestamp without time zone,
    balance numeric(10,2) DEFAULT 100.00,
    bilibili_room_id character varying(20),
    deactivated boolean DEFAULT false,
    registration_ip inet
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: ux_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ux_events (
    id uuid NOT NULL,
    session_id uuid NOT NULL,
    page_view_id uuid NOT NULL,
    user_id integer,
    event_type character varying(50) NOT NULL,
    element_name character varying(80),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_events_element_name_check CHECK (((element_name IS NULL) OR ((element_name)::text ~ '^[a-zA-Z0-9_.:-]{1,80}$'::text))),
    CONSTRAINT ux_events_event_type_check CHECK (((event_type)::text ~ '^[a-z][a-z0-9_]{1,49}$'::text)),
    CONSTRAINT ux_events_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text))
);


--
-- Name: ux_page_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ux_page_views (
    id uuid NOT NULL,
    session_id uuid NOT NULL,
    user_id integer,
    route character varying(180) NOT NULL,
    referrer_route character varying(180),
    entered_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    exited_at timestamp with time zone,
    duration_ms integer DEFAULT 0 NOT NULL,
    active_ms integer DEFAULT 0 NOT NULL,
    max_scroll_percent smallint DEFAULT 0 NOT NULL,
    exit_reason character varying(30),
    is_embedded boolean DEFAULT false NOT NULL,
    first_received_at timestamp with time zone DEFAULT now() NOT NULL,
    last_received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_page_views_active_ms_check CHECK (((active_ms >= 0) AND (active_ms <= 86400000))),
    CONSTRAINT ux_page_views_duration_ms_check CHECK (((duration_ms >= 0) AND (duration_ms <= 86400000))),
    CONSTRAINT ux_page_views_max_scroll_percent_check CHECK (((max_scroll_percent >= 0) AND (max_scroll_percent <= 100))),
    CONSTRAINT ux_page_views_route_check CHECK (((route)::text ~~ '/%'::text))
);


--
-- Name: ux_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ux_sessions (
    id uuid NOT NULL,
    anonymous_id uuid NOT NULL,
    tab_id uuid NOT NULL,
    user_id integer,
    started_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    device_type character varying(20) DEFAULT 'unknown'::character varying NOT NULL,
    platform character varying(80),
    browser_language character varying(35),
    preferred_languages text[] DEFAULT ARRAY[]::text[] NOT NULL,
    app_language character varying(12),
    timezone character varying(80),
    timezone_offset_minutes smallint,
    screen_width integer,
    screen_height integer,
    viewport_width integer,
    viewport_height integer,
    pixel_ratio numeric(5,2),
    orientation character varying(20),
    color_scheme character varying(12),
    reduced_motion boolean,
    high_contrast boolean,
    touch_capable boolean,
    cookies_enabled boolean,
    standalone boolean,
    hardware_concurrency smallint,
    device_memory_gb numeric(5,2),
    connection_type character varying(20),
    save_data boolean,
    user_agent text,
    first_ip inet,
    last_ip inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_sessions_color_scheme_check CHECK (((color_scheme IS NULL) OR ((color_scheme)::text = ANY ((ARRAY['light'::character varying, 'dark'::character varying, 'unknown'::character varying])::text[])))),
    CONSTRAINT ux_sessions_device_type_check CHECK (((device_type)::text = ANY ((ARRAY['desktop'::character varying, 'tablet'::character varying, 'mobile'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT ux_sessions_screen_height_check CHECK (((screen_height IS NULL) OR ((screen_height >= 1) AND (screen_height <= 20000)))),
    CONSTRAINT ux_sessions_screen_width_check CHECK (((screen_width IS NULL) OR ((screen_width >= 1) AND (screen_width <= 20000)))),
    CONSTRAINT ux_sessions_viewport_height_check CHECK (((viewport_height IS NULL) OR ((viewport_height >= 1) AND (viewport_height <= 20000)))),
    CONSTRAINT ux_sessions_viewport_width_check CHECK (((viewport_width IS NULL) OR ((viewport_width >= 1) AND (viewport_width <= 20000))))
);


--
-- Name: wish_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wish_inventory (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    gift_type character varying(50) NOT NULL,
    gift_name character varying(100) NOT NULL,
    bilibili_gift_id character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'stored'::character varying,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text),
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Shanghai'::text),
    sent_at timestamp without time zone,
    gift_exchange_id integer,
    last_failure_reason text,
    source_type text,
    source_batch_id text,
    batch_order integer,
    batch_value integer
);


--
-- Name: wish_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wish_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wish_inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wish_inventory_id_seq OWNED BY public.wish_inventory.id;


--
-- Name: wish_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wish_progress (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    total_wishes integer DEFAULT 0,
    consecutive_fails integer DEFAULT 0,
    last_success_at timestamp without time zone,
    total_spent integer DEFAULT 0,
    total_rewards_value integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    gift_type character varying(50) DEFAULT 'deepsea_singer'::character varying NOT NULL
);


--
-- Name: wish_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wish_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wish_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wish_progress_id_seq OWNED BY public.wish_progress.id;


--
-- Name: wish_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wish_results (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    cost integer DEFAULT 500 NOT NULL,
    success boolean DEFAULT false NOT NULL,
    reward character varying(100),
    reward_value integer,
    balance_before bigint,
    balance_after bigint,
    wishes_count integer DEFAULT 1,
    is_guaranteed boolean DEFAULT false,
    game_details jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    gift_type character varying(50) DEFAULT 'deepsea_singer'::character varying
);


--
-- Name: wish_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wish_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wish_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wish_results_id_seq OWNED BY public.wish_results.id;


--
-- Name: wish_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wish_sessions (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    batch_count integer DEFAULT 1 NOT NULL,
    total_cost integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    total_reward_value integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    gift_type character varying(50) DEFAULT 'deepsea_singer'::character varying NOT NULL,
    gift_name character varying(100) DEFAULT '深海歌姬'::character varying NOT NULL
);


--
-- Name: wish_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wish_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wish_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wish_sessions_id_seq OWNED BY public.wish_sessions.id;


--
-- Name: active_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_sessions ALTER COLUMN id SET DEFAULT nextval('public.active_sessions_id_seq'::regclass);


--
-- Name: availability_blocks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_blocks ALTER COLUMN id SET DEFAULT nextval('public.availability_blocks_id_seq'::regclass);


--
-- Name: balance_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_logs ALTER COLUMN id SET DEFAULT nextval('public.balance_logs_id_seq'::regclass);


--
-- Name: blindbox_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blindbox_logs ALTER COLUMN id SET DEFAULT nextval('public.blindbox_logs_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings ALTER COLUMN id SET DEFAULT nextval('public.bookings_id_seq'::regclass);


--
-- Name: dictation_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_sessions ALTER COLUMN id SET DEFAULT nextval('public.dictation_sessions_id_seq'::regclass);


--
-- Name: dictation_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_submissions ALTER COLUMN id SET DEFAULT nextval('public.dictation_submissions_id_seq'::regclass);


--
-- Name: duel_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duel_logs ALTER COLUMN id SET DEFAULT nextval('public.duel_logs_id_seq'::regclass);


--
-- Name: flip_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flip_logs ALTER COLUMN id SET DEFAULT nextval('public.flip_logs_id_seq'::regclass);


--
-- Name: flip_states id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flip_states ALTER COLUMN id SET DEFAULT nextval('public.flip_states_id_seq'::regclass);


--
-- Name: gift_exchanges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_exchanges ALTER COLUMN id SET DEFAULT nextval('public.gift_exchanges_id_seq'::regclass);


--
-- Name: idempotency_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys ALTER COLUMN id SET DEFAULT nextval('public.idempotency_keys_id_seq'::regclass);


--
-- Name: ip_activities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_activities ALTER COLUMN id SET DEFAULT nextval('public.ip_activities_id_seq'::regclass);


--
-- Name: ip_blacklist id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_blacklist ALTER COLUMN id SET DEFAULT nextval('public.ip_blacklist_id_seq'::regclass);


--
-- Name: ip_whitelist id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_whitelist ALTER COLUMN id SET DEFAULT nextval('public.ip_whitelist_id_seq'::regclass);


--
-- Name: login_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_logs ALTER COLUMN id SET DEFAULT nextval('public.login_logs_id_seq'::regclass);


--
-- Name: pk_gift_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pk_gift_logs ALTER COLUMN id SET DEFAULT nextval('public.pk_gift_logs_id_seq'::regclass);


--
-- Name: pk_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pk_tasks ALTER COLUMN id SET DEFAULT nextval('public.pk_tasks_id_seq'::regclass);


--
-- Name: scratch_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scratch_results ALTER COLUMN id SET DEFAULT nextval('public.scratch_results_id_seq'::regclass);


--
-- Name: security_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events ALTER COLUMN id SET DEFAULT nextval('public.security_events_id_seq'::regclass);


--
-- Name: slot_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slot_results ALTER COLUMN id SET DEFAULT nextval('public.slot_results_id_seq'::regclass);


--
-- Name: spin_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spin_results ALTER COLUMN id SET DEFAULT nextval('public.spin_results_id_seq'::regclass);


--
-- Name: stone_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stone_logs ALTER COLUMN id SET DEFAULT nextval('public.stone_logs_id_seq'::regclass);


--
-- Name: stone_states id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stone_states ALTER COLUMN id SET DEFAULT nextval('public.stone_states_id_seq'::regclass);


--
-- Name: submission_details id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_details ALTER COLUMN id SET DEFAULT nextval('public.submission_details_id_seq'::regclass);


--
-- Name: submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions ALTER COLUMN id SET DEFAULT nextval('public.submissions_id_seq'::regclass);


--
-- Name: user_coupons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_coupons ALTER COLUMN id SET DEFAULT nextval('public.user_coupons_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: wish_inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_inventory ALTER COLUMN id SET DEFAULT nextval('public.wish_inventory_id_seq'::regclass);


--
-- Name: wish_progress id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_progress ALTER COLUMN id SET DEFAULT nextval('public.wish_progress_id_seq'::regclass);


--
-- Name: wish_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_results ALTER COLUMN id SET DEFAULT nextval('public.wish_results_id_seq'::regclass);


--
-- Name: wish_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_sessions ALTER COLUMN id SET DEFAULT nextval('public.wish_sessions_id_seq'::regclass);


--
-- Name: active_sessions active_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_sessions
    ADD CONSTRAINT active_sessions_pkey PRIMARY KEY (id);


--
-- Name: active_sessions active_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_sessions
    ADD CONSTRAINT active_sessions_session_id_key UNIQUE (session_id);


--
-- Name: api_request_nonces api_request_nonces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_request_nonces
    ADD CONSTRAINT api_request_nonces_pkey PRIMARY KEY (nonce);


--
-- Name: availability_blocks availability_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_blocks
    ADD CONSTRAINT availability_blocks_pkey PRIMARY KEY (id);


--
-- Name: balance_audit_baselines balance_audit_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_audit_baselines
    ADD CONSTRAINT balance_audit_baselines_pkey PRIMARY KEY (version, username);


--
-- Name: balance_logs balance_logs_amount_matches_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.balance_logs
    ADD CONSTRAINT balance_logs_amount_matches_check CHECK ((amount = (balance_after - balance_before))) NOT VALID;


--
-- Name: balance_logs balance_logs_nonnegative_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.balance_logs
    ADD CONSTRAINT balance_logs_nonnegative_check CHECK (((balance_before >= (0)::numeric) AND (balance_after >= (0)::numeric))) NOT VALID;


--
-- Name: balance_logs balance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_logs
    ADD CONSTRAINT balance_logs_pkey PRIMARY KEY (id);


--
-- Name: blindbox_logs blindbox_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blindbox_logs
    ADD CONSTRAINT blindbox_logs_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: dictation_allowances dictation_allowances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_allowances
    ADD CONSTRAINT dictation_allowances_pkey PRIMARY KEY (username);


--
-- Name: dictation_progress dictation_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_progress
    ADD CONSTRAINT dictation_progress_pkey PRIMARY KEY (username);


--
-- Name: dictation_sessions dictation_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_sessions
    ADD CONSTRAINT dictation_sessions_pkey PRIMARY KEY (id);


--
-- Name: dictation_submissions dictation_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_submissions
    ADD CONSTRAINT dictation_submissions_pkey PRIMARY KEY (id);


--
-- Name: duel_logs duel_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duel_logs
    ADD CONSTRAINT duel_logs_pkey PRIMARY KEY (id);


--
-- Name: financial_audit_cutovers financial_audit_cutovers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_audit_cutovers
    ADD CONSTRAINT financial_audit_cutovers_pkey PRIMARY KEY (version);


--
-- Name: flip_logs flip_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flip_logs
    ADD CONSTRAINT flip_logs_pkey PRIMARY KEY (id);


--
-- Name: flip_states flip_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flip_states
    ADD CONSTRAINT flip_states_pkey PRIMARY KEY (id);


--
-- Name: flip_states flip_states_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flip_states
    ADD CONSTRAINT flip_states_username_key UNIQUE (username);


--
-- Name: gift_exchanges gift_exchanges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_exchanges
    ADD CONSTRAINT gift_exchanges_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: ip_activities ip_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_activities
    ADD CONSTRAINT ip_activities_pkey PRIMARY KEY (id);


--
-- Name: ip_blacklist ip_blacklist_ip_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_blacklist
    ADD CONSTRAINT ip_blacklist_ip_address_key UNIQUE (ip_address);


--
-- Name: ip_blacklist ip_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_blacklist
    ADD CONSTRAINT ip_blacklist_pkey PRIMARY KEY (id);


--
-- Name: ip_whitelist ip_whitelist_ip_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_whitelist
    ADD CONSTRAINT ip_whitelist_ip_address_key UNIQUE (ip_address);


--
-- Name: ip_whitelist ip_whitelist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_whitelist
    ADD CONSTRAINT ip_whitelist_pkey PRIMARY KEY (id);


--
-- Name: login_logs login_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_pkey PRIMARY KEY (id);


--
-- Name: pk_gift_logs pk_gift_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pk_gift_logs
    ADD CONSTRAINT pk_gift_logs_pkey PRIMARY KEY (id);


--
-- Name: pk_runner_state pk_runner_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pk_runner_state
    ADD CONSTRAINT pk_runner_state_pkey PRIMARY KEY (username);


--
-- Name: pk_tasks pk_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pk_tasks
    ADD CONSTRAINT pk_tasks_pkey PRIMARY KEY (id);


--
-- Name: quiz_question_tokens quiz_question_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_question_tokens
    ADD CONSTRAINT quiz_question_tokens_pkey PRIMARY KEY (token);


--
-- Name: quiz_question_tokens quiz_question_tokens_session_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_question_tokens
    ADD CONSTRAINT quiz_question_tokens_session_id_question_id_key UNIQUE (session_id, question_id);


--
-- Name: quiz_sessions quiz_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_sessions
    ADD CONSTRAINT quiz_sessions_pkey PRIMARY KEY (id);


--
-- Name: scratch_results scratch_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scratch_results
    ADD CONSTRAINT scratch_results_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: slot_results slot_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slot_results
    ADD CONSTRAINT slot_results_pkey PRIMARY KEY (id);


--
-- Name: spin_results spin_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spin_results
    ADD CONSTRAINT spin_results_pkey PRIMARY KEY (id);


--
-- Name: stone_logs stone_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stone_logs
    ADD CONSTRAINT stone_logs_pkey PRIMARY KEY (id);


--
-- Name: stone_states stone_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stone_states
    ADD CONSTRAINT stone_states_pkey PRIMARY KEY (id);


--
-- Name: stone_states stone_states_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stone_states
    ADD CONSTRAINT stone_states_username_key UNIQUE (username);


--
-- Name: submission_details submission_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_details
    ADD CONSTRAINT submission_details_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_proof_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_proof_key UNIQUE (proof);


--
-- Name: user_coupons user_coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_coupons
    ADD CONSTRAINT user_coupons_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: ux_events ux_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_events
    ADD CONSTRAINT ux_events_pkey PRIMARY KEY (id);


--
-- Name: ux_page_views ux_page_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_page_views
    ADD CONSTRAINT ux_page_views_pkey PRIMARY KEY (id);


--
-- Name: ux_sessions ux_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_sessions
    ADD CONSTRAINT ux_sessions_pkey PRIMARY KEY (id);


--
-- Name: wish_inventory wish_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_inventory
    ADD CONSTRAINT wish_inventory_pkey PRIMARY KEY (id);


--
-- Name: wish_progress wish_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_progress
    ADD CONSTRAINT wish_progress_pkey PRIMARY KEY (id);


--
-- Name: wish_progress wish_progress_user_gift_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_progress
    ADD CONSTRAINT wish_progress_user_gift_unique UNIQUE (username, gift_type);


--
-- Name: wish_results wish_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_results
    ADD CONSTRAINT wish_results_pkey PRIMARY KEY (id);


--
-- Name: wish_sessions wish_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_sessions
    ADD CONSTRAINT wish_sessions_pkey PRIMARY KEY (id);


--
-- Name: IDX_user_sessions_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_user_sessions_expire" ON public.user_sessions USING btree (expire);


--
-- Name: idx_active_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_sessions_active ON public.active_sessions USING btree (is_active);


--
-- Name: idx_active_sessions_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_sessions_ip ON public.active_sessions USING btree (ip_address);


--
-- Name: idx_active_sessions_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_sessions_session_id ON public.active_sessions USING btree (session_id);


--
-- Name: idx_active_sessions_session_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_active_sessions_session_id_unique ON public.active_sessions USING btree (session_id);


--
-- Name: idx_active_sessions_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_sessions_user_active ON public.active_sessions USING btree (username, is_active, last_activity DESC);


--
-- Name: idx_active_sessions_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_sessions_username ON public.active_sessions USING btree (username);


--
-- Name: idx_api_request_nonces_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_request_nonces_created ON public.api_request_nonces USING btree (created_at);


--
-- Name: idx_availability_blocks_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_blocks_time ON public.availability_blocks USING btree (start_time, end_time);


--
-- Name: idx_balance_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_logs_created_at ON public.balance_logs USING btree (created_at DESC);


--
-- Name: idx_balance_logs_operation_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_logs_operation_type ON public.balance_logs USING btree (operation_type);


--
-- Name: idx_balance_logs_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_logs_request_id ON public.balance_logs USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: idx_balance_logs_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_logs_username ON public.balance_logs USING btree (username);


--
-- Name: idx_balance_logs_username_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_logs_username_created_at ON public.balance_logs USING btree (username, created_at DESC);


--
-- Name: idx_blindbox_logs_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blindbox_logs_username_created ON public.blindbox_logs USING btree (username, created_at DESC);


--
-- Name: idx_bookings_time_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_time_status ON public.bookings USING btree (status, start_time, end_time);


--
-- Name: idx_dictation_progress_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dictation_progress_updated_at ON public.dictation_progress USING btree (updated_at);


--
-- Name: idx_dictation_sessions_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dictation_sessions_started_at ON public.dictation_sessions USING btree (started_at);


--
-- Name: idx_dictation_sessions_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dictation_sessions_username ON public.dictation_sessions USING btree (username);


--
-- Name: idx_dictation_submissions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dictation_submissions_created_at ON public.dictation_submissions USING btree (created_at);


--
-- Name: idx_dictation_submissions_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dictation_submissions_username ON public.dictation_submissions USING btree (username);


--
-- Name: idx_duel_logs_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_duel_logs_username_created ON public.duel_logs USING btree (username, created_at DESC);


--
-- Name: idx_flip_logs_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flip_logs_username_created ON public.flip_logs USING btree (username, created_at DESC);


--
-- Name: idx_flip_states_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flip_states_username ON public.flip_states USING btree (username);


--
-- Name: idx_gift_exchanges_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_exchanges_created_at ON public.gift_exchanges USING btree (created_at);


--
-- Name: idx_gift_exchanges_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_gift_exchanges_idempotency ON public.gift_exchanges USING btree (username, idempotency_key);


--
-- Name: idx_gift_exchanges_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_exchanges_status ON public.gift_exchanges USING btree (status);


--
-- Name: idx_gift_exchanges_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_exchanges_username ON public.gift_exchanges USING btree (username);


--
-- Name: idx_idempotency_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_created_at ON public.idempotency_keys USING btree (created_at DESC);


--
-- Name: idx_idempotency_keys_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_keys_updated_at ON public.idempotency_keys USING btree (updated_at);


--
-- Name: idx_idempotency_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_idempotency_username_key ON public.idempotency_keys USING btree (username, idempotency_key);


--
-- Name: idx_ip_activities_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_activities_action ON public.ip_activities USING btree (action);


--
-- Name: idx_ip_activities_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_activities_created_at ON public.ip_activities USING btree (created_at);


--
-- Name: idx_ip_activities_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_activities_ip ON public.ip_activities USING btree (ip_address);


--
-- Name: idx_ip_activities_ip_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_activities_ip_created ON public.ip_activities USING btree (ip_address, created_at DESC);


--
-- Name: idx_ip_activities_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_activities_user_created ON public.ip_activities USING btree (username, created_at DESC);


--
-- Name: idx_ip_activities_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_activities_username ON public.ip_activities USING btree (username);


--
-- Name: idx_login_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_logs_created_at ON public.login_logs USING btree (created_at);


--
-- Name: idx_login_logs_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_logs_ip ON public.login_logs USING btree (ip_address);


--
-- Name: idx_login_logs_result; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_logs_result ON public.login_logs USING btree (login_result);


--
-- Name: idx_login_logs_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_logs_username ON public.login_logs USING btree (username);


--
-- Name: idx_pk_gift_logs_report_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pk_gift_logs_report_id_unique ON public.pk_gift_logs USING btree (report_id);


--
-- Name: idx_pk_gift_logs_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pk_gift_logs_username ON public.pk_gift_logs USING btree (username, created_at DESC);


--
-- Name: idx_pk_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pk_tasks_status ON public.pk_tasks USING btree (status, created_at);


--
-- Name: idx_pk_tasks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pk_tasks_user ON public.pk_tasks USING btree (username, created_at DESC);


--
-- Name: idx_quiz_sessions_user_status_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_sessions_user_status_expires ON public.quiz_sessions USING btree (username, status, expires_at DESC);


--
-- Name: idx_quiz_tokens_session_consumed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_tokens_session_consumed ON public.quiz_question_tokens USING btree (session_id, consumed_at, created_at);


--
-- Name: idx_scratch_results_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scratch_results_username_created ON public.scratch_results USING btree (username, created_at DESC);


--
-- Name: idx_security_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_events_created ON public.security_events USING btree (created_at DESC);


--
-- Name: idx_security_events_handled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_events_handled ON public.security_events USING btree (handled);


--
-- Name: idx_security_events_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_events_severity ON public.security_events USING btree (severity);


--
-- Name: idx_security_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_events_type ON public.security_events USING btree (event_type);


--
-- Name: idx_slot_results_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slot_results_username_created ON public.slot_results USING btree (username, created_at DESC);


--
-- Name: idx_spin_results_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spin_results_username_created ON public.spin_results USING btree (username, created_at DESC);


--
-- Name: idx_stone_logs_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stone_logs_username_created ON public.stone_logs USING btree (username, created_at DESC);


--
-- Name: idx_stone_states_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stone_states_username ON public.stone_states USING btree (username);


--
-- Name: idx_submission_details_submission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submission_details_submission_id ON public.submission_details USING btree (submission_id);


--
-- Name: idx_submissions_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_username_created ON public.submissions USING btree (username, submitted_at DESC);


--
-- Name: idx_user_coupons_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_coupons_username_created ON public.user_coupons USING btree (username, created_at DESC);


--
-- Name: idx_user_sessions_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_expire ON public.user_sessions USING btree (expire);


--
-- Name: idx_users_bilibili_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_bilibili_room_id ON public.users USING btree (bilibili_room_id);


--
-- Name: idx_users_registration_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_registration_ip ON public.users USING btree (registration_ip) WHERE (registration_ip IS NOT NULL);


--
-- Name: idx_ux_events_page_view; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ux_events_page_view ON public.ux_events USING btree (page_view_id, occurred_at);


--
-- Name: idx_ux_events_type_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ux_events_type_occurred ON public.ux_events USING btree (event_type, occurred_at DESC);


--
-- Name: idx_ux_page_views_route_entered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ux_page_views_route_entered ON public.ux_page_views USING btree (route, entered_at DESC);


--
-- Name: idx_ux_page_views_session_entered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ux_page_views_session_entered ON public.ux_page_views USING btree (session_id, entered_at);


--
-- Name: idx_ux_page_views_user_entered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ux_page_views_user_entered ON public.ux_page_views USING btree (user_id, entered_at DESC);


--
-- Name: idx_ux_sessions_anonymous; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ux_sessions_anonymous ON public.ux_sessions USING btree (anonymous_id, started_at DESC);


--
-- Name: idx_ux_sessions_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ux_sessions_last_seen ON public.ux_sessions USING btree (last_seen_at DESC);


--
-- Name: idx_ux_sessions_user_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ux_sessions_user_started ON public.ux_sessions USING btree (user_id, started_at DESC);


--
-- Name: idx_wish_inventory_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_inventory_status ON public.wish_inventory USING btree (status, expires_at);


--
-- Name: idx_wish_inventory_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_inventory_username_created ON public.wish_inventory USING btree (username, created_at DESC);


--
-- Name: idx_wish_progress_consecutive_fails; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_progress_consecutive_fails ON public.wish_progress USING btree (consecutive_fails DESC);


--
-- Name: idx_wish_progress_user_gift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_progress_user_gift ON public.wish_progress USING btree (username, gift_type);


--
-- Name: idx_wish_progress_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_progress_username ON public.wish_progress USING btree (username);


--
-- Name: idx_wish_results_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_results_success ON public.wish_results USING btree (success, created_at DESC);


--
-- Name: idx_wish_results_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_results_username_created ON public.wish_results USING btree (username, created_at DESC);


--
-- Name: idx_wish_sessions_user_gift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_sessions_user_gift ON public.wish_sessions USING btree (username, gift_type);


--
-- Name: idx_wish_sessions_username_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_sessions_username_created ON public.wish_sessions USING btree (username, created_at DESC);


--
-- Name: balance_audit_baselines balance_audit_baselines_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER balance_audit_baselines_append_only BEFORE DELETE OR UPDATE ON public.balance_audit_baselines FOR EACH ROW EXECUTE FUNCTION public.reject_balance_log_mutation();


--
-- Name: balance_logs balance_logs_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER balance_logs_append_only BEFORE DELETE OR UPDATE ON public.balance_logs FOR EACH ROW EXECUTE FUNCTION public.reject_balance_log_mutation();


--
-- Name: financial_audit_cutovers financial_audit_cutovers_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER financial_audit_cutovers_append_only BEFORE DELETE OR UPDATE ON public.financial_audit_cutovers FOR EACH ROW EXECUTE FUNCTION public.reject_balance_log_mutation();


--
-- Name: dictation_allowances dictation_allowances_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_allowances
    ADD CONSTRAINT dictation_allowances_username_fkey FOREIGN KEY (username) REFERENCES public.users(username) ON DELETE CASCADE;


--
-- Name: dictation_progress dictation_progress_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_progress
    ADD CONSTRAINT dictation_progress_username_fkey FOREIGN KEY (username) REFERENCES public.users(username) ON DELETE CASCADE;


--
-- Name: dictation_sessions dictation_sessions_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_sessions
    ADD CONSTRAINT dictation_sessions_username_fkey FOREIGN KEY (username) REFERENCES public.users(username) ON DELETE CASCADE;


--
-- Name: dictation_submissions dictation_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictation_submissions
    ADD CONSTRAINT dictation_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: duel_logs duel_logs_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duel_logs
    ADD CONSTRAINT duel_logs_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: flip_logs flip_logs_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flip_logs
    ADD CONSTRAINT flip_logs_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: flip_states flip_states_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flip_states
    ADD CONSTRAINT flip_states_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: quiz_question_tokens quiz_question_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_question_tokens
    ADD CONSTRAINT quiz_question_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.quiz_sessions(id) ON DELETE CASCADE;


--
-- Name: quiz_sessions quiz_sessions_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_sessions
    ADD CONSTRAINT quiz_sessions_username_fkey FOREIGN KEY (username) REFERENCES public.users(username) ON DELETE CASCADE;


--
-- Name: stone_logs stone_logs_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stone_logs
    ADD CONSTRAINT stone_logs_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: stone_states stone_states_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stone_states
    ADD CONSTRAINT stone_states_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: submission_details submission_details_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_details
    ADD CONSTRAINT submission_details_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id);


--
-- Name: ux_events ux_events_page_view_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_events
    ADD CONSTRAINT ux_events_page_view_id_fkey FOREIGN KEY (page_view_id) REFERENCES public.ux_page_views(id) ON DELETE CASCADE;


--
-- Name: ux_events ux_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_events
    ADD CONSTRAINT ux_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ux_sessions(id) ON DELETE CASCADE;


--
-- Name: ux_events ux_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_events
    ADD CONSTRAINT ux_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ux_page_views ux_page_views_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_page_views
    ADD CONSTRAINT ux_page_views_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ux_sessions(id) ON DELETE CASCADE;


--
-- Name: ux_page_views ux_page_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_page_views
    ADD CONSTRAINT ux_page_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ux_sessions ux_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ux_sessions
    ADD CONSTRAINT ux_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: wish_inventory wish_inventory_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_inventory
    ADD CONSTRAINT wish_inventory_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: wish_progress wish_progress_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_progress
    ADD CONSTRAINT wish_progress_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: wish_results wish_results_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_results
    ADD CONSTRAINT wish_results_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: wish_sessions wish_sessions_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_sessions
    ADD CONSTRAINT wish_sessions_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- PostgreSQL database dump complete
--
