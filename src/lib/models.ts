import mongoose, { Schema, model, models } from 'mongoose';

const UserSchema = new Schema({
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    full_name: { type: String },
    avatar_url: { type: String },
    billing_address: { type: Schema.Types.Mixed }, // Flexible JSON
    payment_method: { type: Schema.Types.Mixed }, // Flexible JSON
    skills: { type: [Schema.Types.Mixed] },
    preferences: { type: Schema.Types.Mixed },

    // Password Reset Fields
    reset_token: { type: String },
    reset_token_expires: { type: Date },

}, { timestamps: true });

export const User = models.User || model('User', UserSchema);

// ... Other models remain the same but included for completeness if file overwritten
const ResumeSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    content: { type: Schema.Types.Mixed }, // Flexible JSON content
    template: { type: String },
    is_public: { type: Boolean, default: false },
}, { timestamps: true });

export const Resume = models.Resume || model('Resume', ResumeSchema);

const JobSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    job_id: { type: String, required: true, unique: true },
    source: { type: String },
    job_snapshot: { type: Schema.Types.Mixed },
    title: { type: String },
    company: { type: String },
    location: { type: String },
    description: { type: String },
    apply_url: { type: String },
    status: { type: String, default: 'saved' }, // saved, applied, interviewing, offered, rejected
    salary: { type: String },
    notes: { type: String },
    saved_at: { type: Date, default: Date.now },
}, { timestamps: true });

export const Job = models.Job || model('Job', JobSchema);

const WatchlistSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true },
    name: { type: String },
    price_at_add: { type: Number },
}, { timestamps: true });

export const Watchlist = models.Watchlist || model('Watchlist', WatchlistSchema);

const TransactionSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    category: { type: String },
    merchant: { type: String },
    date: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

export const Transaction = models.Transaction || model('Transaction', TransactionSchema);

const ConversationSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'New Chat' },
    messages: [{
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
}, { timestamps: true });

export const Conversation = models.Conversation || model('Conversation', ConversationSchema);
