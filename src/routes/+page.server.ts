import { addPost, getAllPostsWithUser } from '$lib/db/services/post';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fail, message, setError, superValidate } from 'sveltekit-superforms';
import { postTextSchema, signInFormSchema, signUpFormSchema } from '$lib/forms/schema';
import { zod } from 'sveltekit-superforms/adapters';
import { generateIdFromEntropySize } from 'lucia';
import { hash, verify } from '@node-rs/argon2';
import { getUserByEmail, getUserByUsername, insertUserWithPassword } from '$lib/db/services/user';
import { lucia } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	// if (!event.locals.user) {
	// 	redirect(302, '/login');
	// }
	// const posts = await getAllPostsWithUser();

	return {
		posts: await getAllPostsWithUser(),
		user: event.locals.user,
		signInForm: await superValidate(zod(signInFormSchema)),
		signUpForm: await superValidate(zod(signUpFormSchema)),
		postTextForm: await superValidate(zod(postTextSchema))
	};
};

export const actions = {
	signIn: async ({ request, cookies }) => {
		const form = await superValidate(request, zod(signInFormSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		const username = form.data.username;
		const password = form.data.password;

		const existingUser = await getUserByUsername(username);
		if (!existingUser || !existingUser.passwordHash) {
			return setError(form, 'password', 'Incorrect username or password.');
		}

		const validPassword = await verify(existingUser.passwordHash, password, {
			memoryCost: 19456,
			timeCost: 2,
			outputLen: 32,
			parallelism: 1
		});
		if (!validPassword) {
			return setError(form, 'password', 'Incorrect username or password.');
		}

		const session = await lucia.createSession(existingUser.id, {});
		const sessionCookie = lucia.createSessionCookie(session.id);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		redirect(302, '/');
	},
	signUp: async ({ request, cookies }) => {
		const form = await superValidate(request, zod(signUpFormSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		const username = form.data.username;
		const email = form.data.email;

		const existedUserWithEmail = await getUserByEmail(email);
		if (existedUserWithEmail) {
			return setError(form, 'email', 'E-mail already exists.');
		}

		const existedUserWithUsername = await getUserByUsername(username);
		if (existedUserWithUsername) {
			return setError(form, 'username', 'Username already taken.');
		}

		const userId = generateIdFromEntropySize(10);
		const password = form.data.password;
		const passwordHash = await hash(password, {
			memoryCost: 19456,
			timeCost: 2,
			outputLen: 32,
			parallelism: 1
		});

		const isAdded = await insertUserWithPassword({ id: userId, username, email }, passwordHash);
		if (!isAdded) {
			return setError(form, 'username', 'Not possible to add user.');
		}
		const session = await lucia.createSession(userId, {});
		const sessionCookie = lucia.createSessionCookie(session.id);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
		redirect(302, '/');
	},
	addPost: async ({ request, locals }) => {
		const form = await superValidate(request, zod(postTextSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		if (!locals.user) {
			return fail(400, { error: 'user is not authenticated' });
		}

		const textContent = form.data.textContent;
		const isAdded = addPost(textContent, locals.user.id);
		if (!isAdded) {
			return setError(form, 'textContent', 'Not possible to post. Try again.');
		}

		return { form };
	}
} satisfies Actions;
